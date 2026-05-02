import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import fs from 'fs';
import { spawn } from 'child_process';
import { GoogleGenAI, HarmBlockThreshold, HarmCategory, createPartFromUri, FileState } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MinimalFollower = {
  username: string;
  full_name: string;
};

type CredibilityResult = {
  username: string;
  score: number;
};

type CredibilityModelResult = {
  averageScore: number;
  verdict: string;
  featureSnapshot: Record<string, unknown>;
};

type PostAnalysisResult = {
  content_type: string;
  topic: string;
  tone: string;
  expected_reactions: string[];
  expected_comment_themes: string[];
  sensitive_topics: string[];
  language: string;
};

type PostCommentInput = {
  owner_username: string;
  text: string;
};

type PreparedPost = {
  post_num: number;
  media_url: string;
  mime_type_hint: string;
  caption: string;
  comments: PostCommentInput[];
};

type PostEngagementScore = {
  post_num: number;
  score: number;
};

type GeminiApiKeyEntry = {
  key: string;
  index: number;
};

type AiDebugError = {
  id: string;
  label: string;
  timestamp: string;
  message: string;
  snippet: string;
};

const CHUNK_SIZE = 20;
const POST_ANALYSIS_MODEL = 'gemini-3.1-flash-lite-preview';
const ENGAGEMENT_SCORING_MODEL = 'gemma-4-31b-it';
const recentAiDebugErrors: AiDebugError[] = [];
const HACK_MAIN_SCRIPT_PATH = path.join(process.cwd(), 'hack-main', 'predict_once.py');

function isMockModeEnabled() {
  return String(process.env.USE_MOCK_DATA || '').toUpperCase() === 'TRUE';
}

function isMockPostSet(posts: PreparedPost[]) {
  return posts.length > 0 && posts.every((post) => post.media_url.includes('unsplash.com') || post.caption.includes('mock post'));
}

function getGeminiApiKeys(): GeminiApiKeyEntry[] {
  return String(process.env.GEMINI_API_KEY || '')
    .split(',')
    .map((key, index) => ({ key: key.trim(), index }))
    .filter((entry) => entry.key.length > 0);
}

function getGeminiErrorMessage(error: any) {
  return error?.message || error?.error?.message || String(error);
}

function shouldRetryGeminiError(error: any) {
  const message = getGeminiErrorMessage(error).toLowerCase();
  const status = error?.status || error?.error?.status || error?.code || error?.error?.code;

  return (
    error instanceof SyntaxError ||
    status === 429 ||
    status === 500 ||
    status === 503 ||
    message.includes('503') ||
    message.includes('unavailable') ||
    message.includes('high demand') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('unexpected token') ||
    message.includes('unexpected non-whitespace') ||
    message.includes('json') ||
    message.includes('parse')
  );
}

async function retryGeminiOperation<T>(
  label: string,
  operation: (ai: GoogleGenAI, keyInfo: GeminiApiKeyEntry, attempt: number) => Promise<T>
) {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  let attempt = 0;
  while (true) {
    const keyInfo = apiKeys[attempt % apiKeys.length];
    const ai = new GoogleGenAI({ apiKey: keyInfo.key });

    try {
      return await operation(ai, keyInfo, attempt);
    } catch (error: any) {
      const details = getGeminiErrorMessage(error);
      console.error(`[${label}] Attempt ${attempt + 1} failed on Gemini key #${keyInfo.index + 1}: ${details}`);

      if (!shouldRetryGeminiError(error) && apiKeys.length === 1) {
        throw error;
      }

      attempt += 1;
      await sleep(1000);
    }
  }
}

function sanitizeFollowersForCredibility(followers: any[]): MinimalFollower[] {
  return followers
    .map((f: any) => ({
      username: String(f?.username || '').trim(),
      full_name: String(f?.fullName || f?.full_name || '').trim(),
    }))
    .filter((f) => f.username.length > 0);
}

function stripMarkdownFences(text: string) {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

function addAiDebugError(label: string, message: string, rawText: string) {
  recentAiDebugErrors.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    timestamp: new Date().toISOString(),
    message,
    snippet: rawText.slice(0, 1200),
  });

  if (recentAiDebugErrors.length > 25) {
    recentAiDebugErrors.length = 25;
  }
}

function extractFirstBalancedJsonBlock(text: string) {
  const cleaned = stripMarkdownFences(text);
  const startIndex = cleaned.search(/[\[{]/);
  if (startIndex === -1) {
    return cleaned;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const last = stack[stack.length - 1];
      if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
        stack.pop();
      }

      if (stack.length === 0) {
        return cleaned.slice(startIndex, i + 1);
      }
    }
  }

  return cleaned.slice(startIndex);
}

function parseJsonFromModelResponse(rawText: string, label: string) {
  const jsonBlock = extractFirstBalancedJsonBlock(rawText);

  try {
    return JSON.parse(jsonBlock);
  } catch (error: any) {
    addAiDebugError(label, error?.message || 'Failed to parse model JSON response', rawText);
    throw error;
  }
}

function clampScore(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeChunkResults(parsed: any, chunk: MinimalFollower[]): CredibilityResult[] {
  const rawResults = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.accounts)
        ? parsed.accounts
        : [];

  const byUsername = new Map<string, CredibilityResult>();
  for (const item of rawResults) {
    const username = String(item?.username || '').trim();
    if (!username) continue;
    byUsername.set(username, {
      username,
      score: clampScore(item?.score),
    });
  }

  return chunk.map((follower) => ({
    username: follower.username,
    score: byUsername.get(follower.username)?.score ?? 0,
  }));
}

function getInfluencerCategory(followersCount: number) {
  if (followersCount >= 1_000_000) return 'Mega';
  if (followersCount >= 100_000) return 'Macro';
  if (followersCount >= 10_000) return 'Micro';
  return 'Nano';
}

function inferProductCategory(account: any) {
  const text = `${account?.biography || ''} ${(account?.latestPosts || []).map((post: any) => post?.caption || '').join(' ')}`.toLowerCase();

  if (text.includes('beauty') || text.includes('makeup') || text.includes('skincare')) return 'Beauty';
  if (text.includes('fashion') || text.includes('outfit') || text.includes('style')) return 'Fashion';
  if (text.includes('tech') || text.includes('gadget') || text.includes('iphone') || text.includes('android')) return 'Tech';
  if (text.includes('food') || text.includes('recipe') || text.includes('restaurant')) return 'Food';
  if (text.includes('travel') || text.includes('trip') || text.includes('hotel')) return 'Travel';
  if (text.includes('fitness') || text.includes('workout') || text.includes('gym')) return 'Fitness';
  if (text.includes('gaming') || text.includes('game') || text.includes('stream')) return 'Gaming';
  if (text.includes('finance') || text.includes('money') || text.includes('invest')) return 'Finance';
  if (text.includes('home') || text.includes('decor') || text.includes('interior')) return 'Home';
  if (text.includes('education') || text.includes('learn') || text.includes('tutorial')) return 'Education';

  return 'Fashion';
}

function computeUsernameRandomness(username: string) {
  if (!username) return 1;
  const digits = (username.match(/\d/g) || []).length;
  const underscores = (username.match(/[_\.]/g) || []).length;
  const vowels = (username.match(/[aeiou]/gi) || []).length;
  const consonants = (username.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length;
  const letterBalance = vowels + consonants > 0 ? Math.abs(vowels - consonants) / (vowels + consonants) : 1;
  const symbolRatio = (digits + underscores) / username.length;
  return clampUnit(symbolRatio * 0.65 + letterBalance * 0.35);
}

function computeFollowerHeuristics(followers: any[]) {
  const sample = followers.slice(0, 100);
  const usernames = sample.map((f) => String(f?.username || '').trim()).filter(Boolean);
  const fullNames = sample.map((f) => String(f?.fullName || f?.full_name || '').trim());
  const usernameRandomnessValues = usernames.map(computeUsernameRandomness);
  const usernameRandomnessScore = usernameRandomnessValues.length > 0
    ? usernameRandomnessValues.reduce((acc, value) => acc + value, 0) / usernameRandomnessValues.length
    : 0.5;

  const profileCompletenessAvg = sample.length > 0
    ? sample.reduce((acc, follower) => {
        let score = 0;
        if (String(follower?.username || '').trim()) score += 0.45;
        if (String(follower?.fullName || follower?.full_name || '').trim()) score += 0.35;
        if (String(follower?.profilePicUrl || '').trim()) score += 0.2;
        return acc + score;
      }, 0) / sample.length
    : 0.5;

  const botFlags = sample.map((follower, index) => {
    const randomness = usernameRandomnessValues[index] ?? 0.5;
    const missingName = !fullNames[index] ? 0.25 : 0;
    const numericHeavy = /\d{4,}/.test(String(follower?.username || '')) ? 0.2 : 0;
    return clampUnit(randomness * 0.65 + missingName + numericHeavy);
  });

  const botProbabilityAvg = botFlags.length > 0
    ? botFlags.reduce((acc, value) => acc + value, 0) / botFlags.length
    : 0.2;
  const spamAccountRatio = botFlags.length > 0
    ? botFlags.filter((value) => value >= 0.65).length / botFlags.length
    : 0;

  return {
    usernameRandomnessScore,
    profileCompletenessAvg,
    botProbabilityAvg,
    spamAccountRatio,
  };
}

function computeCommentHeuristics(posts: any[], followersCount: number) {
  const comments = posts.flatMap((post: any) => Array.isArray(post?.latestComments) ? post.latestComments : []);
  const totalComments = comments.length;
  const normalizedComments = comments.map((comment: any) => String(comment?.text || '').trim()).filter(Boolean);
  const byText = new Map<string, number>();
  normalizedComments.forEach((text) => {
    byText.set(text.toLowerCase(), (byText.get(text.toLowerCase()) || 0) + 1);
  });

  const duplicateCommentRatio = totalComments > 0
    ? Array.from(byText.values()).filter((count) => count > 1).reduce((acc, count) => acc + count, 0) / totalComments
    : 0;

  const positiveWords = ['love', 'great', 'amazing', 'nice', 'fire', 'beautiful', 'perfect', 'best', 'cool', 'wow', '🔥', '❤️', '😍', '👏'];
  const negativeWords = ['bad', 'hate', 'worst', 'ugly', 'boring', 'fake', 'terrible', 'awful', 'stupid', 'annoying'];

  let positiveCount = 0;
  let negativeCount = 0;
  normalizedComments.forEach((text) => {
    const lower = text.toLowerCase();
    if (positiveWords.some((word) => lower.includes(word))) positiveCount += 1;
    if (negativeWords.some((word) => lower.includes(word))) negativeCount += 1;
  });

  const positiveCommentRatio = totalComments > 0 ? positiveCount / totalComments : 0;
  const negativeCommentRatio = totalComments > 0 ? negativeCount / totalComments : 0;
  const commentSentimentAvg = clampUnit(0.5 + (positiveCommentRatio - negativeCommentRatio) * 0.5);

  const uniqueCommenters = new Set(
    comments.map((comment: any) => String(comment?.ownerUsername || '').trim().toLowerCase()).filter(Boolean)
  );
  const activeFollowersRatio = followersCount > 0 ? clampUnit(uniqueCommenters.size / Math.min(followersCount, 100)) : 0;
  const dailyActiveFollowers = followersCount > 0 ? Math.round(activeFollowersRatio * followersCount) : 0;
  const followerActivityRate = activeFollowersRatio;

  return {
    duplicateCommentRatio,
    positiveCommentRatio,
    negativeCommentRatio,
    commentSentimentAvg,
    activeFollowersRatio,
    dailyActiveFollowers,
    followerActivityRate,
  };
}

function computePostCadenceMetrics(posts: any[]) {
  const ordered = [...posts]
    .filter((post: any) => post?.timestamp)
    .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (ordered.length < 2) {
    return {
      postFrequency: ordered.length,
      postingConsistency: 0.5,
    };
  }

  const gapsInDays: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = new Date(ordered[i - 1].timestamp).getTime();
    const next = new Date(ordered[i].timestamp).getTime();
    gapsInDays.push(Math.max(0.25, (next - prev) / 86_400_000));
  }

  const avgGap = gapsInDays.reduce((acc, gap) => acc + gap, 0) / gapsInDays.length;
  const gapVariance = gapsInDays.reduce((acc, gap) => acc + Math.pow(gap - avgGap, 2), 0) / gapsInDays.length;
  const gapStdDev = Math.sqrt(gapVariance);

  return {
    postFrequency: clampUnit(30 / avgGap) * 30,
    postingConsistency: clampUnit(1 / (1 + gapStdDev)),
  };
}

function computeFitScores(account: any, brandInput: any) {
  const posts = (account?.latestPosts || []).slice(0, 10);
  const bio = (account?.biography || '').toLowerCase();
  const captions = posts.map((p: any) => (p?.caption || '').toLowerCase()).join(' ');
  const influencerText = `${bio} ${captions}`;
  const followersCount = safeNumber(account?.followersCount, 0);

  const productCategory: string = brandInput?.productCategory || 'Fashion';
  const brandPositioning: string = brandInput?.brandPositioning || 'Mass Market';
  const productPrice = safeNumber(brandInput?.productPrice, 25);
  const brandDescription = (brandInput?.brandDescription || '').toLowerCase();
  const campaignGoal: string = brandInput?.campaignGoal || 'Engagement';

  // category_match_score: keyword overlap between influencer content and product category
  const categoryKeywords: Record<string, string[]> = {
    Beauty: ['beauty','makeup','skincare','cosmetic','glow','serum','foundation','lipstick'],
    Fashion: ['fashion','outfit','style','ootd','clothing','wear','dress','trend'],
    Tech: ['tech','gadget','iphone','android','laptop','software','app','device'],
    Food: ['food','recipe','restaurant','eat','cook','meal','dish','cuisine'],
    Travel: ['travel','trip','hotel','flight','destination','explore','vacation'],
    Fitness: ['fitness','workout','gym','exercise','training','health','muscle'],
    Gaming: ['gaming','game','stream','twitch','esport','play','console'],
    Finance: ['finance','money','invest','crypto','stock','budget','wealth'],
    Home: ['home','decor','interior','furniture','room','design','house'],
    Education: ['education','learn','tutorial','course','study','knowledge','teach'],
  };
  const keywords = categoryKeywords[productCategory] || [];
  const matchCount = keywords.filter(k => influencerText.includes(k)).length;
  const category_match_score = clampUnit(matchCount / Math.max(keywords.length * 0.4, 1));

  // price_fit_score: does product price fit the brand positioning tier?
  const positioningPriceMap: Record<string, [number, number]> = {
    Luxury:        [200, 99999],
    Premium:       [50,  500],
    'Mass Market': [15,  150],
    Budget:        [1,   50],
  };
  const [minPrice, maxPrice] = positioningPriceMap[brandPositioning] || [15, 150];
  const price_fit_score = productPrice >= minPrice && productPrice <= maxPrice
    ? 1.0
    : productPrice < minPrice
      ? clampUnit(1 - (minPrice - productPrice) / minPrice)
      : clampUnit(1 - (productPrice - maxPrice) / maxPrice);

  // audience_product_fit: overlap between brand description keywords and influencer content
  const brandWords = brandDescription.split(/\s+/).filter((w: string) => w.length > 4);
  const brandMatchCount = brandWords.filter((w: string) => influencerText.includes(w)).length;
  const audience_product_fit = brandWords.length > 0
    ? clampUnit(0.3 + (brandMatchCount / brandWords.length) * 0.7)
    : 0.5;

  // brand_fit_score: does influencer tone match brand positioning?
  const luxurySignals = ['luxury','premium','exclusive','high-end','elegant','sophisticated','designer'];
  const budgetSignals = ['affordable','cheap','budget','deal','discount','sale','value'];
  const luxuryCount = luxurySignals.filter(w => influencerText.includes(w)).length;
  const budgetCount = budgetSignals.filter(w => influencerText.includes(w)).length;
  let brand_fit_score = 0.5;
  if (brandPositioning === 'Luxury' || brandPositioning === 'Premium') {
    brand_fit_score = clampUnit(0.4 + luxuryCount * 0.15 - budgetCount * 0.1);
  } else if (brandPositioning === 'Budget') {
    brand_fit_score = clampUnit(0.4 + budgetCount * 0.15 - luxuryCount * 0.1);
  } else {
    brand_fit_score = clampUnit(0.5 + (brandMatchCount / Math.max(brandWords.length, 1)) * 0.3);
  }

  // engagement_weight_context: how much engagement matters for this campaign goal
  const goalEngagementWeight: Record<string, number> = {
    Engagement: 0.9,
    Awareness:  0.6,
    Conversion: 0.7,
    Retention:  0.5,
  };
  const baseWeight = goalEngagementWeight[campaignGoal] ?? 0.5;
  const avgEngagementForWeight = posts.reduce((acc: number, p: any) =>
    acc + safeNumber(p?.likesCount ?? p?.likes, 0) + safeNumber(p?.commentsCount, 0), 0) / Math.max(posts.length, 1);
  const engRateForWeight = followersCount > 0 ? avgEngagementForWeight / followersCount : 0;
  const engagement_weight_context = clampUnit(baseWeight * (0.5 + engRateForWeight * 5));

  return { category_match_score, price_fit_score, audience_product_fit, brand_fit_score, engagement_weight_context, productCategory, campaignGoal, brandPositioning, productPrice };
}

function deriveHackMainFeatures(account: any, followers: any[], brandInput?: any) {
  const posts = (account?.latestPosts || []).slice(0, 10);
  const followersCount = safeNumber(account?.followersCount, 0);
  const followingCount = safeNumber(account?.followsCount, 0);
  const likes = posts.map((post: any) => safeNumber(post?.likesCount ?? post?.likes, 0));
  const comments = posts.map((post: any) => safeNumber(post?.commentsCount, 0));
  const engagements = posts.map((post: any, index: number) => likes[index] + comments[index]);
  const avgLikes = likes.length > 0 ? likes.reduce((acc, value) => acc + value, 0) / likes.length : 0;
  const avgComments = comments.length > 0 ? comments.reduce((acc, value) => acc + value, 0) / comments.length : 0;
  const avgEngagement = engagements.length > 0 ? engagements.reduce((acc, value) => acc + value, 0) / engagements.length : 0;
  const engagementRate = followersCount > 0 ? avgEngagement / followersCount : 0;
  const engagementVariance = engagements.length > 0
    ? engagements.reduce((acc, value) => acc + Math.pow(value - avgEngagement, 2), 0) / engagements.length
    : 0;
  const likesStdDev = likes.length > 0
    ? Math.sqrt(likes.reduce((acc, value) => acc + Math.pow(value - avgLikes, 2), 0) / likes.length)
    : 0;

  const oldestLikes = likes[0] || 0;
  const latestLikes = likes[likes.length - 1] || 0;
  const oldestComments = comments[0] || 0;
  const latestComments = comments[comments.length - 1] || 0;
  const likesGrowthRate = oldestLikes > 0 ? (latestLikes - oldestLikes) / oldestLikes : 0;
  const commentGrowthRate = oldestComments > 0 ? (latestComments - oldestComments) / oldestComments : 0;
  const likesDecayOverTime = oldestLikes > 0 ? clampUnit((oldestLikes - latestLikes) / oldestLikes) : 0;
  const commentsPerFollowerRatio = followersCount > 0 ? avgComments / followersCount : 0;
  const commentRate = avgLikes > 0 ? avgComments / avgLikes : 0;

  const followerHeuristics = computeFollowerHeuristics(followers);
  const commentHeuristics = computeCommentHeuristics(posts, followersCount);
  const cadence = computePostCadenceMetrics(posts);
  const fit = computeFitScores(account, brandInput);

  return {
    influencer_category: getInfluencerCategory(followersCount),
    followers_count: followersCount,
    follower_growth_30d: 0,
    engagement_rate: engagementRate,
    avg_engagement_per_post: avgEngagement,
    active_followers_ratio: commentHeuristics.activeFollowersRatio,
    bot_probability_avg: followerHeuristics.botProbabilityAvg,
    comment_sentiment_avg: commentHeuristics.commentSentimentAvg,
    duplicate_comment_ratio: commentHeuristics.duplicateCommentRatio,
    posting_consistency: cadence.postingConsistency,
    post_frequency: cadence.postFrequency,
    audience_age_mean: 27,
    product_category: fit.productCategory,
    campaign_goal: fit.campaignGoal,
    brand_positioning: fit.brandPositioning,
    product_price: fit.productPrice,
    category_match_score: fit.category_match_score,
    audience_product_fit: fit.audience_product_fit,
    price_fit_score: fit.price_fit_score,
    brand_fit_score: fit.brand_fit_score,
    engagement_weight_context: fit.engagement_weight_context,
    engagement_rate_last_10_posts: engagementRate,
    engagement_rate_variance: engagementVariance,
    avg_likes_per_post: avgLikes,
    likes_growth_rate: likesGrowthRate,
    likes_decay_over_time: likesDecayOverTime,
    likes_std_dev: likesStdDev,
    avg_comments_per_post: avgComments,
    comment_rate: commentRate,
    comment_growth_rate: commentGrowthRate,
    comments_per_follower_ratio: commentsPerFollowerRatio,
    share_rate: 0,
    following_count: followingCount,
    followers_following_ratio: followingCount > 0 ? followersCount / followingCount : followersCount,
    follower_growth_7d: 0,
    username_randomness_score: followerHeuristics.usernameRandomnessScore,
    profile_completeness_avg: followerHeuristics.profileCompletenessAvg,
    posting_frequency_of_followers: 0,
    spam_account_ratio: followerHeuristics.spamAccountRatio,
    follower_growth_90d: 0,
    follower_activity_rate: commentHeuristics.followerActivityRate,
    daily_active_followers: commentHeuristics.dailyActiveFollowers,
    growth_acceleration: 0,
    positive_comment_ratio: commentHeuristics.positiveCommentRatio,
    negative_comment_ratio: commentHeuristics.negativeCommentRatio,
  };
}

function runHackMainPredict(features: Record<string, unknown>) {
  return new Promise<{ match_score: number }>((resolve, reject) => {
    const child = spawn('python', [HACK_MAIN_SCRIPT_PATH], {
      cwd: path.join(process.cwd(), 'hack-main'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `hack-main scorer exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error: any) {
        reject(new Error(`Failed to parse hack-main scorer output: ${error.message}`));
      }
    });

    child.stdin.write(JSON.stringify(features));
    child.stdin.end();
  });
}

async function scoreFollowersWithHackMain(account: any, followers: any[], brandInput?: any): Promise<CredibilityModelResult> {
  const featureSnapshot = deriveHackMainFeatures(account, followers, brandInput);
  const result = await runHackMainPredict(featureSnapshot);
  const normalizedScore = clampScore(safeNumber(result.match_score, 0) * 100);

  let verdict = 'Low confidence audience quality';
  if (normalizedScore >= 80) verdict = 'High confidence audience quality';
  else if (normalizedScore >= 65) verdict = 'Good audience quality';
  else if (normalizedScore >= 50) verdict = 'Mixed audience quality';

  return {
    averageScore: normalizedScore,
    verdict,
    featureSnapshot,
  };
}

async function warmHackMainModel() {
  const warmPayload = {
    influencer_category: 'Micro',
    followers_count: 50000,
    follower_growth_30d: 0,
    engagement_rate: 0.04,
    avg_engagement_per_post: 2000,
    active_followers_ratio: 0.5,
    bot_probability_avg: 0.15,
    comment_sentiment_avg: 0.6,
    duplicate_comment_ratio: 0.05,
    posting_consistency: 0.7,
    post_frequency: 8,
    audience_age_mean: 27,
    product_category: 'Fashion',
    campaign_goal: 'Engagement',
    brand_positioning: 'Mass Market',
    product_price: 25,
    category_match_score: 0.5,
    audience_product_fit: 0.5,
    price_fit_score: 0.5,
    brand_fit_score: 0.5,
    engagement_weight_context: 0.5,
  };

  try {
    await runHackMainPredict(warmPayload);
    console.log('hack-main model warm-up completed');
  } catch (error: any) {
    console.error('hack-main model warm-up failed:', error.message);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferMimeTypeFromUrl(url: string, isVideo: boolean) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.mp4')) return 'video/mp4';
  if (lowerUrl.includes('.mov')) return 'video/quicktime';
  if (lowerUrl.includes('.webm')) return 'video/webm';
  if (lowerUrl.includes('.png')) return 'image/png';
  if (lowerUrl.includes('.webp')) return 'image/webp';
  if (lowerUrl.includes('.gif')) return 'image/gif';
  if (lowerUrl.includes('.heic')) return 'image/heic';
  return isVideo ? 'video/mp4' : 'image/jpeg';
}

function extensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    case 'video/webm':
      return '.webm';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/heic':
      return '.heic';
    default:
      return '.jpg';
  }
}

function normalizePostAnalysis(parsed: any): PostAnalysisResult {
  return {
    content_type: String(parsed?.content_type || 'lifestyle').trim() || 'lifestyle',
    topic: String(parsed?.topic || 'Unable to determine topic.').trim() || 'Unable to determine topic.',
    tone: String(parsed?.tone || 'neutral').trim() || 'neutral',
    expected_reactions: Array.isArray(parsed?.expected_reactions)
      ? parsed.expected_reactions.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [],
    expected_comment_themes: Array.isArray(parsed?.expected_comment_themes)
      ? parsed.expected_comment_themes.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [],
    sensitive_topics: Array.isArray(parsed?.sensitive_topics)
      ? parsed.sensitive_topics.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [],
    language: String(parsed?.language || 'Unknown').trim() || 'Unknown',
  };
}

function sanitizePostsForEngagement(posts: any[]): PreparedPost[] {
  return (posts || [])
    .slice(0, 10)
    .map((post: any, index: number) => {
      const isVideo = post?.type === 'Video' || !!post?.videoUrl;
      const mediaUrl = String(
        post?.videoUrl ||
        post?.displayUrl ||
        post?.thumbnailUrl ||
        (Array.isArray(post?.images) && post.images.length > 0 ? post.images[0] : '') ||
        ''
      ).trim();

      const comments = Array.isArray(post?.latestComments)
        ? post.latestComments
            .map((comment: any) => ({
              owner_username: String(comment?.ownerUsername || comment?.username || '').trim(),
              text: String(comment?.text || '').trim(),
            }))
            .filter((comment: PostCommentInput) => comment.text.length > 0)
        : [];

      return {
        post_num: index + 1,
        media_url: mediaUrl,
        mime_type_hint: inferMimeTypeFromUrl(mediaUrl, isVideo),
        caption: String(post?.caption || '').trim(),
        comments,
      };
    })
    .filter((post: PreparedPost) => post.media_url.length > 0);
}

function createMockPostAnalyses(posts: PreparedPost[]): { post_num: number; description: PostAnalysisResult; comments: PostCommentInput[] }[] {
  const contentTypes = ['funny', 'lifestyle', 'reaction', 'motivational', 'educational'];
  const tones = ['humorous', 'energetic', 'neutral', 'inspirational', 'serious'];

  return posts.map((post, index) => ({
    post_num: post.post_num,
    description: {
      content_type: contentTypes[index % contentTypes.length],
      topic: post.caption || `Post ${post.post_num} showcases a creator moment designed to spark audience reactions.`,
      tone: tones[index % tones.length],
      expected_reactions: index % 2 === 0 ? ['😂', '🔥', '😭'] : ['❤️', '🔥', '👏'],
      expected_comment_themes: [
        'reacting to a specific moment in the post',
        'tagging friends who relate',
        'quoting something shown or said in the post',
      ],
      sensitive_topics: [],
      language: 'Tunisian Arabic',
    },
    comments: post.comments,
  }));
}

function createMockPostEngagementScores(posts: { post_num: number; comments: PostCommentInput[] }[]): PostEngagementScore[] {
  return posts.map((post, index) => {
    const commentBoost = Math.min(12, post.comments.length);
    const score = Math.max(45, Math.min(95, 58 + (index * 7) % 25 + commentBoost));
    return {
      post_num: post.post_num,
      score,
    };
  });
}

async function downloadMediaToTempFile(mediaUrl: string, mimeTypeHint: string, label: string) {
  const response = await fetch(mediaUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.instagram.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media for ${label}`);
  }

  const contentTypeHeader = response.headers.get('content-type')?.split(';')[0]?.trim();
  const mimeType = contentTypeHeader || mimeTypeHint;
  const extension = extensionFromMimeType(mimeType);
  const tempFilePath = path.join(os.tmpdir(), `sti-${label}-${Date.now()}${extension}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  await fs.promises.writeFile(tempFilePath, buffer);
  return { tempFilePath, mimeType };
}

async function waitForGeminiFileActive(ai: GoogleGenAI, fileName: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const file = await ai.files.get({ name: fileName });
    if (file.state === FileState.ACTIVE || !file.state) {
      return file;
    }
    if (file.state === FileState.FAILED) {
      throw new Error(file.error?.message || `Gemini file processing failed for ${fileName}`);
    }
    await sleep(2000);
  }

  throw new Error(`Timed out waiting for Gemini file processing: ${fileName}`);
}

async function analyzePostMedia(
  post: PreparedPost,
  systemInstruction: string,
  config: any
) {
  return retryGeminiOperation(`post-analysis-${post.post_num}`, async (ai) => {
    const { tempFilePath, mimeType } = await downloadMediaToTempFile(post.media_url, post.mime_type_hint, `post-${post.post_num}`);
    let uploadedFileName: string | undefined;

    try {
      const uploadedFile = await ai.files.upload({
        file: tempFilePath,
        config: {
          mimeType,
        },
      });

      uploadedFileName = uploadedFile.name;
      const readyFile = uploadedFile.name ? await waitForGeminiFileActive(ai, uploadedFile.name) : uploadedFile;
      const readyUri = readyFile.uri || uploadedFile.uri;
      const readyMimeType = readyFile.mimeType || uploadedFile.mimeType || mimeType;

      if (!readyUri || !readyMimeType) {
        throw new Error(`Uploaded media for post ${post.post_num} is missing uri or mime type`);
      }

      const response = await ai.models.generateContentStream({
        model: POST_ANALYSIS_MODEL,
        config: {
          ...config,
          systemInstruction,
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Analyze post number ${post.post_num}. Caption: ${post.caption || 'No caption provided.'} Return only the required JSON.`,
              },
              createPartFromUri(readyUri, readyMimeType),
            ],
          },
        ],
      });

      let fullText = '';
      for await (const streamChunk of response) {
        if (streamChunk.text) {
          fullText += streamChunk.text;
        }
      }

      const parsed = parseJsonFromModelResponse(fullText, `post-analysis-${post.post_num}`);
      return normalizePostAnalysis(parsed);
    } finally {
      try {
        await fs.promises.rm(tempFilePath, { force: true });
      } catch {}

      if (uploadedFileName) {
        try {
          await ai.files.delete({ name: uploadedFileName });
        } catch {}
      }
    }
  });
}

function normalizePostEngagementResults(parsed: any, posts: { post_num: number }[]): PostEngagementScore[] {
  const rawResults = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.posts)
        ? parsed.posts
        : parsed && typeof parsed === 'object'
          ? [parsed]
          : [];

  const scoreByPostNum = new Map<number, PostEngagementScore>();
  for (const item of rawResults) {
    const postNum = Number(item?.post_num);
    if (!Number.isFinite(postNum)) continue;
    scoreByPostNum.set(postNum, {
      post_num: postNum,
      score: clampScore(item?.score),
    });
  }

  return posts.map((post) => ({
    post_num: post.post_num,
    score: scoreByPostNum.get(post.post_num)?.score ?? 0,
  }));
}

async function scoreFollowerChunk(
  config: any,
  chunk: MinimalFollower[],
  chunkIndex: number,
  totalFollowers: number
) {
  const inputPayload = JSON.stringify(chunk);
  const userPrompt = `Score this JSON array of followers. Input keys are username and full_name. Return only a JSON array with one object per follower using keys username and score.\n${inputPayload}`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: userPrompt }],
    },
  ];

  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, totalFollowers);
  console.log(`Sending chunk to Gemini: ${start} to ${end}`);

  return retryGeminiOperation(`followers-credibility-${chunkIndex + 1}`, async (ai) => {
    const response = await ai.models.generateContentStream({
      model: ENGAGEMENT_SCORING_MODEL,
      config,
      contents,
    });

    let fullText = '';
    for await (const streamChunk of response) {
      if (streamChunk.text) {
        fullText += streamChunk.text;
      }
    }

    const parsed = parseJsonFromModelResponse(fullText, `followers-credibility-${chunkIndex + 1}`);
    return normalizeChunkResults(parsed, chunk);
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  app.post('/api/playwright-login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      console.log('Starting Playwright for login...');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      try {
        console.log('Navigating to Instagram...');
        await page.goto('https://www.instagram.com/');
        
        await page.waitForSelector('input[name="username"]', { timeout: 15000 });
        console.log('Filling credentials...');
        await page.fill('input[name="username"]', username);
        await page.fill('input[name="password"]', password);
        console.log('Submitting login...');
        await page.click('button[type="submit"]');

        await Promise.race([
            page.waitForNavigation({ waitUntil: 'networkidle' }),
            page.waitForSelector('[data-testid="login-error-message"]'),
            page.waitForSelector('#slfErrorAlert'),
            page.waitForURL(/.*instagram\.com\/(?!accounts\/login).*/)
        ]);

        const loggedInUrl = page.url();
        if (loggedInUrl.includes('login')) {
             throw new Error('Login failed. Check credentials or Instagram might require verification.');
        }

        const cookies = await context.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        res.json({ cookie: cookieString, cookiesObj: cookies });
      } finally {
        await browser.close();
      }
    } catch (error: any) {
      console.error('Playwright Login Error:', error.message);
      res.status(500).json({ error: error.message || 'Playwright login failed' });
    }
  });

  app.post('/api/playwright-search', async (req, res) => {
    try {
      const { query, cookie } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      console.log('Starting Playwright for search...');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      let finalCookie = cookie;
      if (!finalCookie && process.env.IG_SESSIONID) {
        finalCookie = `sessionid=${process.env.IG_SESSIONID}; ds_user_id=${process.env.IG_DS_USER_ID || ''}; csrftoken=${process.env.IG_CSRFTOKEN || ''}`;
      }

      if (finalCookie) {
        // Convert cookie string to Playwright cookie objects
        const pwCookies = finalCookie.split(';').map((c: string) => {
            const [name, ...val] = c.trim().split('=');
            return {
                name: name.trim(),
                value: val.join('=').trim(),
                domain: '.instagram.com',
                path: '/'
            };
        }).filter((c: any) => c.name);
        await context.addCookies(pwCookies);
      }

      const page = await context.newPage();

      try {
        console.log(`Executing topsearch for query: ${query}...`);
        const searchUrl = `https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(query)}`;
        const response = await page.goto(searchUrl, { waitUntil: 'load' });
        
        if (!response) {
            throw new Error('Failed to get response from search endpoint');
        }

        const body = await response.text();
        let payload;
        try {
            // Instagram JSON pages might have JSON wrapped in pre tags if viewed as HTML, or just raw JSON
            payload = JSON.parse(body);
        } catch (e) {
            // Check if it's wrapped in HTML
            const textContent = await page.evaluate(() => document.body.textContent || '');
            try {
               payload = JSON.parse(textContent);
            } catch(e2) {
               console.error('Failed to parse JSON response:', textContent.substring(0, 200));
               throw new Error('Received non-JSON response from Instagram. Check if logged in correctly.');
            }
        }

        res.json(payload);
      } finally {
        await browser.close();
      }
    } catch (error: any) {
      console.error('Playwright Search Error:', error.message);
      res.status(500).json({ error: error.message || 'Playwright operation failed' });
    }
  });

  app.post('/api/apify-account', async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      if (isMockModeEnabled() && username.toLowerCase() === 'xx') {
        return res.json([{
          username: 'xx_mock_user',
          fullName: 'Nour Ben Salem',
          profilePicUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200',
          profilePicUrlHD: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200',
          biography: 'Lifestyle creator sharing Tunis food spots, daily routines, and funny moments from Tunis.',
          followersCount: 154000,
          followsCount: 420,
          postsCount: 86,
          isVerified: true,
          latestPosts: Array.from({ length: 10 }).map((_, i) => ({
            id: `mock_post_${i}`,
            type: i % 2 === 0 ? 'Video' : 'Image',
            shortCode: `mockCode${i}`,
            caption: [
              'POV: when your friend says just 5 minutes before dinner in Tunis',
              'Coffee, croissant, and a slow morning in La Marsa.',
              'Trying every brik spot people recommended and ranking them honestly.',
              'A quick reset routine when the week gets too noisy.',
              'Explaining why this hidden beach is still my favorite summer escape.',
              'Day in my life between editing, errands, and sunset tea.',
              'Testing a viral snack combo so you do not have to.',
              'Small reminder that consistency beats waiting for perfect timing.',
              'Outfit details because everyone kept asking in the comments.',
              'Weekend family lunch and the dessert absolutely carried.'
            ][i],
            likesCount: 6200 + i * 540 + Math.floor(Math.random() * 900),
            commentsCount: 160 + i * 12 + Math.floor(Math.random() * 40),
            videoViewCount: i % 2 === 0 ? 64000 + i * 3100 + Math.floor(Math.random() * 6000) : 0,
            displayUrl: `https://images.unsplash.com/photo-${1500000000000 + i}?auto=format&fit=crop&w=400&h=400`,
            thumbnailUrl: `https://images.unsplash.com/photo-${1500000000000 + i}?auto=format&fit=crop&w=400&h=400`,
            timestamp: new Date(Date.now() - i * 86400000).toISOString(),
            url: `https://www.instagram.com/p/mockCode${i}/`
          }))
        }]);
      }

      let API_TOKEN = process.env.APIFY_API_TOKEN;
      if (!API_TOKEN) {
        // Try fallback token from req body for testing purposes but do not leak
        API_TOKEN = req.body.token;
      }
      if (!API_TOKEN) {
        throw new Error('APIFY_API_TOKEN is not set in the environment variables.');
      }

      console.log(`Starting Apify scrape for ${username}...`);
      const input = {
          usernames: [username],
          includeAboutSection: false
      };

      const apifyRes = await fetch(`https://api.apify.com/v2/acts/dSCLg0C3YEZ83HzYX/run-sync-get-dataset-items?token=${API_TOKEN}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(input)
      });
      
      if (!apifyRes.ok) {
          const errData = await apifyRes.text();
          throw new Error(`Apify error: ${errData}`);
      }
      
      const apifyData = await apifyRes.json();
      res.json(apifyData);
      
    } catch (error: any) {
      console.error('Apify Account Error:', error.message);
      res.status(500).json({ error: error.message || 'Apify operation failed' });
    }
  });

  app.post('/api/apify-comments', async (req, res) => {
    try {
      const { directUrls } = req.body;
      if (!directUrls || !Array.isArray(directUrls) || directUrls.length === 0) {
        return res.status(400).json({ error: 'directUrls array is required' });
      }

      if (isMockModeEnabled() && directUrls.some(u => u.includes('mockCode'))) {
        const commentPools = [
          ['hahahah this is too real', 'my sister is exactly like this', 'nah the timing killed me', 'sending this to my friend immediately', 'too accurate'],
          ['need this exact breakfast spot pls', 'la marsa mornings always hit different', 'love this calm vibe', 'the coffee shot looks so good', 'where is this place?'],
          ['okay now I want a full top 10 list', 'adding this brik place to my list', 'you actually influenced me here', 'which one was the crispiest?', 'finally someone ranked them properly'],
          ['needed this reminder today honestly', 'the reset content is my favorite', 'so simple but so helpful', 'trying this tonight', 'this felt peaceful'],
          ['that beach view is unreal', 'going there next weekend', 'the water color omg', 'saved this for summer', 'this place looks amazing'],
          ['the edit on this is so clean', 'love the little daily moments', 'this is exactly how my week looks', 'you make normal days feel cinematic', 'more content like this please'],
          ['i cannot believe people actually eat that combo', 'you are brave for trying this', 'not me wanting to test it now', 'the reaction said everything', 'this was too funny'],
          ['perfect timing for this message', 'needed this push', 'consistency really is the whole game', 'saving this reminder', 'that line at the end was strong'],
          ['thank you for the outfit details finally', 'where is the jacket from?', 'the colors look so good together', 'okay now do a full styling post', 'this fit was too clean'],
          ['family lunch content always wins', 'the dessert looked insane', 'now i am hungry', 'this felt so warm', 'the table looked beautiful']
        ];
        const usernames = ['sarra.b', 'youssef_daily', 'ineslovesfood', 'mariem.tn', 'tunisianvibes', 'amal.jpg', 'karimshots', 'raniacreates', 'mehdi_h', 'salma.notes'];
        const mockComments = directUrls.flatMap((url, index) =>
          commentPools[index % commentPools.length].map((text, commentIndex) => ({
            postUrl: url,
            text,
            ownerUsername: usernames[commentIndex % usernames.length],
            ownerProfilePicUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&h=100'
          }))
        );
        return res.json(mockComments);
      }

      let API_TOKEN = process.env.APIFY_API_TOKEN;
      if (!API_TOKEN) {
        API_TOKEN = req.body.token;
      }
      if (!API_TOKEN) {
        throw new Error('APIFY_API_TOKEN is not set in the environment variables.');
      }

      console.log(`Starting Apify comment scrape for ${directUrls.length} posts...`);
      const { ApifyClient } = await import('apify-client');
      const client = new ApifyClient({
          token: API_TOKEN,
      });

      const input = {
          directUrls: directUrls,
          resultsLimit: 15
      };

      const run = await client.actor("SbK00X0JYCPblD2wp").call(input);
      
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      
      res.json(items);
      
    } catch (error: any) {
      console.error('Apify Comments Error:', error.message);
      res.status(500).json({ error: error.message || 'Apify comments operation failed' });
    }
  });

  app.post('/api/apify-followers', async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      if (isMockModeEnabled() && username.toLowerCase() === 'xx') {
        const baseFollowers = [
          ['sarra.b', 'Sarra Ben Ali'],
          ['mehdi.hammami', 'Mehdi Hammami'],
          ['ineslovesfood', 'Ines Trabelsi'],
          ['youssefdaily', 'Youssef Jebali'],
          ['amal.jpg', 'Amal Gharbi'],
          ['tunisianvibes', 'Tunisian Vibes'],
          ['karimshots', 'Karim Ben Salah'],
          ['salma_notes', 'Salma Cherif'],
          ['marwa.fit', 'Marwa Ben Youssef'],
          ['travelwithrayen', 'Rayen Ayadi']
        ];
        const mockFollowers = Array.from({ length: 100 }).map((_, i) => {
          const [baseUsername, baseName] = baseFollowers[i % baseFollowers.length];
          const variant = Math.floor(i / baseFollowers.length);
          return {
            username: variant === 0 ? baseUsername : `${baseUsername}${variant}`,
            fullName: variant % 3 === 0 ? baseName : `${baseName.split(' ')[0]} ${['Tunis', 'Studio', 'Daily'][variant % 3]}`,
            profilePicUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&h=100'
          };
        });
        return res.json(mockFollowers);
      }

      let API_TOKEN = process.env.APIFY_API_TOKEN;
      if (!API_TOKEN) {
        API_TOKEN = req.body.token;
      }
      if (!API_TOKEN) {
        throw new Error('APIFY_API_TOKEN is not set in the environment variables.');
      }

      console.log(`Starting Apify followers scrape for ${username}...`);
      const { ApifyClient } = await import('apify-client');
      const client = new ApifyClient({
          token: API_TOKEN,
      });

      const input = {
          "Account": [username],
          "resultsLimit": 100,
          "dataToScrape": "Followers"
      };

      const run = await client.actor("jWD4G57HhqYY0mFhd").call(input);
      
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      
      res.json(items);
      
    } catch (error: any) {
      console.error('Apify Followers Error:', error.message);
      res.status(500).json({ error: error.message || 'Apify followers operation failed' });
    }
  });

  app.post('/api/followers-credibility', async (req, res) => {
    try {
      const { followers, accountData, brandInput } = req.body;
      if (!followers || !Array.isArray(followers)) {
         return res.status(400).json({ error: 'Followers array required' });
      }
      if (!accountData || typeof accountData !== 'object') {
        return res.status(400).json({ error: 'accountData is required' });
      }

      const minimalFollowers = sanitizeFollowersForCredibility(followers);

      if (minimalFollowers.length === 0) {
        return res.json({
          averageScore: 0,
          totalAnalyzed: 0,
          chunkSize: CHUNK_SIZE,
          credibilityResults: [],
        });
      }

      const modelResult = await scoreFollowersWithHackMain(accountData, followers, brandInput);

      res.json({
        averageScore: modelResult.averageScore,
        totalAnalyzed: minimalFollowers.length,
        chunkSize: CHUNK_SIZE,
        credibilityResults: [],
        verdict: modelResult.verdict,
        featureSnapshot: modelResult.featureSnapshot,
        scoringSource: 'hack-main',
      });
    } catch (err: any) {
      console.error('Followers Credibility Error:', getGeminiErrorMessage(err));
      res.status(500).json({ error: 'Followers credibility scoring is temporarily unavailable' });
    }
  });

  app.post('/api/fans-content-engagement', async (req, res) => {
    try {
      const { posts } = req.body;
      if (!Array.isArray(posts)) {
        return res.status(400).json({ error: 'Posts array required' });
      }

      const preparedPosts = sanitizePostsForEngagement(posts);
      if (preparedPosts.length === 0) {
        return res.json({
          averageScore: 0,
          postScores: [],
        });
      }

      if (isMockModeEnabled() && isMockPostSet(preparedPosts)) {
        const analyzedPosts = createMockPostAnalyses(preparedPosts);
        const postScores = createMockPostEngagementScores(analyzedPosts);
        const averageScore = Math.round(
          postScores.reduce((acc, curr) => acc + curr.score, 0) / postScores.length
        );

        return res.json({
          averageScore,
          postScores,
        });
      }

      if (getGeminiApiKeys().length === 0) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
      }

      const postAnalysisInstructions = fs.readFileSync(path.join(process.cwd(), 'public/post_analysis.md'), 'utf-8');
      const engagementScoringInstructions = fs.readFileSync(path.join(process.cwd(), 'public/post_engagement_score.md'), 'utf-8');

      const sharedConfig: any = {
        thinkingConfig: {
          thinkingLevel: 'HIGH',
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
        responseMimeType: 'application/json',
      };

      const postDescriptions = await Promise.all(
        preparedPosts.map(async (post) => ({
          post_num: post.post_num,
          description: await analyzePostMedia(post, postAnalysisInstructions, sharedConfig),
          comments: post.comments,
        }))
      );

      const scoringPayload = JSON.stringify({
        posts: postDescriptions.map((post) => ({
          post_num: post.post_num,
          post_description: post.description,
          comments: post.comments,
        })),
      });

      const parsedScores = await retryGeminiOperation('post-engagement-scoring', async (ai) => {
        const scoringResponse = await ai.models.generateContentStream({
          model: ENGAGEMENT_SCORING_MODEL,
          config: {
            ...sharedConfig,
            systemInstruction: engagementScoringInstructions,
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Score each post in this JSON payload and return only a JSON array with one object per post using keys post_num and score.\n${scoringPayload}`,
                },
              ],
            },
          ],
        });

        let scoringText = '';
        for await (const streamChunk of scoringResponse) {
          if (streamChunk.text) {
            scoringText += streamChunk.text;
          }
        }

        return parseJsonFromModelResponse(scoringText, 'post-engagement-scoring');
      });
      const postScores = normalizePostEngagementResults(parsedScores, preparedPosts);
      const averageScore = Math.round(
        postScores.reduce((acc, curr) => acc + curr.score, 0) / postScores.length
      );

      return res.json({
        averageScore,
        postScores,
      });
    } catch (err: any) {
      console.error('Fans Content Engagement Error:', getGeminiErrorMessage(err));
      res.status(500).json({ error: 'Fans content engagement is temporarily unavailable' });
    }
  });

  // Proxy endpoint to fetch image to bypass CORS and Referrer issues
  app.get('/api/image', async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).send('URL required');
      }

      const fetchResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.instagram.com/'
        }
      });

      if (!fetchResponse.ok) {
        throw new Error('Failed to fetch image');
      }

      const buffer = await fetchResponse.arrayBuffer();
      res.setHeader('Content-Type', fetchResponse.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (req.query.download === 'true') {
        res.setHeader('Content-Disposition', 'attachment; filename="profile.jpg"');
      }
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).send('Error loading image');
    }
  });

  app.get('/api/ai-debug-errors', async (req, res) => {
    res.json(recentAiDebugErrors);
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload is too large' });
    }
    if (err) {
      console.error('Express Error:', err.message || err);
      return res.status(500).json({ error: err.message || 'Server error' });
    }
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  warmHackMainModel();
}

startServer();

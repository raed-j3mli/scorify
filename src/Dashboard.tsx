import { useEffect, useState, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MoreHorizontal, Heart, MessageCircle, Check, Loader2, Play, ChevronDown, ChevronRight, BarChart2, Activity, TrendingUp, TrendingDown, Eye, PlusCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DashboardMetrics {
  engagementRateLast10: number; // percentage
  engagementRateVariance: number;
  avgEngagementPerPost: number;
  avgLikesPerPost: number;
  likesStdDev: number;
  avgCommentsPerPost: number;
  avgCommentRateViewBased: number; // percentage
  recent10CommentRates: { label: string; rate: number; views: number; comments: number; isVideo: boolean }[];
  recent10Engagements: { timestamp: string; label: string; engagement: number; likes: number; comments: number; }[];
}

interface CredibilityResult {
  username: string;
  score: number;
}

interface CredibilityData {
  averageScore: number;
  credibilityResults: CredibilityResult[];
  totalAnalyzed: number;
  chunkSize: number;
  verdict?: string;
  featureSnapshot?: Record<string, unknown>;
  scoringSource?: string;
}

interface BrandInput {
  productCategory: string;
  campaignGoal: string;
  brandPositioning: string;
  productPrice: string;
  brandDescription: string;
}

interface FanEngagementScore {
  post_num: number;
  score: number;
}

interface FanEngagementData {
  averageScore: number;
  postScores: FanEngagementScore[];
}

interface AiDebugError {
  id: string;
  label: string;
  timestamp: string;
  message: string;
  snippet: string;
}

const parseApiJson = async (res: Response) => {
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    throw new Error('Invalid JSON response from server');
  }
};

const getFriendlyApiError = (fallback: string, err: unknown) => {
  const message = err instanceof Error ? err.message : '';

  if (!message) return fallback;
  if (message.includes('413')) return 'The request was too large to process.';
  if (message.includes('429') || message.toLowerCase().includes('rate')) return fallback;
  if (message.includes('500') || message.includes('503')) return fallback;
  if (message.toLowerCase().includes('invalid json')) return fallback;

  return fallback;
};

function SummaryScoreSkeleton() {
  return (
    <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 mt-2 min-h-[280px] relative overflow-hidden animate-pulse">
      <div className="relative flex flex-col items-center md:flex-row md:items-center gap-8 h-full">
        <div className="w-[148px] h-[148px] rounded-full border-[12px] border-[#262626] shrink-0" />
        <div className="flex-1 w-full text-center md:text-left">
          <div className="h-3 w-36 bg-[#262626] rounded mb-4 mx-auto md:mx-0" />
          <div className="h-8 w-32 bg-[#262626] rounded-full mb-5 mx-auto md:mx-0" />
          <div className="space-y-3 max-w-sm mx-auto md:mx-0">
            <div className="h-3.5 w-full bg-[#262626] rounded" />
            <div className="h-3.5 w-[88%] bg-[#262626] rounded" />
            <div className="h-3.5 w-[72%] bg-[#262626] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsCardSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`bg-[#121212] border border-[#262626] rounded-2xl p-6 relative overflow-hidden animate-pulse ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="h-4 w-40 bg-[#262626] rounded" />
        <div className="w-10 h-10 bg-[#262626] rounded-lg" />
      </div>
      <div className="h-9 w-28 bg-[#262626] rounded mb-3" />
      <div className="h-3 w-24 bg-[#262626] rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 mt-6 animate-pulse">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-6 h-6 rounded bg-[#262626]" />
        <div className="h-5 w-56 bg-[#262626] rounded" />
      </div>
      <div className="h-72 w-full rounded-xl bg-[linear-gradient(180deg,rgba(38,38,38,0.9),rgba(18,18,18,0.8))] border border-[#262626]" />
    </div>
  );
}

const getCredibilityTone = (score: number) => {
  if (score >= 80) {
    return {
      color: '#22c55e',
      textClass: 'text-green-500',
      badgeClass: 'bg-green-500/10 text-green-500',
      label: 'Excellent match',
    };
  }

  if (score >= 65) {
    return {
      color: '#3b82f6',
      textClass: 'text-blue-500',
      badgeClass: 'bg-blue-500/10 text-blue-500',
      label: 'Good match',
    };
  }

  if (score >= 50) {
    return {
      color: '#f59e0b',
      textClass: 'text-amber-500',
      badgeClass: 'bg-amber-500/10 text-amber-500',
      label: 'Moderate match',
    };
  }

  return {
    color: '#ef4444',
    textClass: 'text-red-500',
    badgeClass: 'bg-red-500/10 text-red-500',
    label: 'Poor match',
  };
};

const getFanEngagementTone = (score: number) => {
  if (score >= 75) {
    return {
      color: '#38bdf8',
      textClass: 'text-sky-400',
      badgeClass: 'bg-sky-500/10 text-sky-400',
      label: 'Highly relevant',
    };
  }

  if (score >= 50) {
    return {
      color: '#f59e0b',
      textClass: 'text-amber-500',
      badgeClass: 'bg-amber-500/10 text-amber-500',
      label: 'Mixed quality',
    };
  }

  return {
    color: '#ef4444',
    textClass: 'text-red-500',
    badgeClass: 'bg-red-500/10 text-red-500',
    label: 'Weak alignment',
  };
};

const getEngagementTone = (followersCount: number, rate: number) => {
  let thresholds = { poor: 2.5, average: 2.5, good: 4, excellent: 8 };

  if (followersCount >= 1000000) {
    thresholds = { poor: 0.7, average: 0.7, good: 1.0, excellent: 2.0 };
  } else if (followersCount >= 500000) {
    thresholds = { poor: 0.8, average: 0.8, good: 1.2, excellent: 2.5 };
  } else if (followersCount >= 50000) {
    thresholds = { poor: 0.9, average: 0.9, good: 1.5, excellent: 3.5 };
  } else if (followersCount >= 10000) {
    thresholds = { poor: 1.1, average: 1.1, good: 2.0, excellent: 5.0 };
  }

  if (rate >= thresholds.excellent) {
    return { label: 'Excellent', colorClass: 'bg-green-500/10 text-green-500' };
  } else if (rate >= thresholds.good) {
    return { label: 'Good', colorClass: 'bg-blue-500/10 text-blue-500' };
  } else if (rate >= thresholds.average) {
    return { label: 'Average', colorClass: 'bg-amber-500/10 text-amber-500' };
  } else {
    return { label: 'Poor', colorClass: 'bg-red-500/10 text-red-500' };
  }
};

const calculateMetrics = (account: any): DashboardMetrics | null => {
  if (!account) return null;
  const followers = account.followersCount || 1;
  const posts = (account.latestPosts || []).slice(0, 10);
  
  if (posts.length === 0) {
    return {
      engagementRateLast10: 0,
      engagementRateVariance: 0,
      avgEngagementPerPost: 0,
      avgLikesPerPost: 0,
      likesStdDev: 0,
      avgCommentsPerPost: 0,
      avgCommentRateViewBased: 0,
      recent10CommentRates: [],
      recent10Engagements: [],
    };
  }
  
  let totalEngagement = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalViews = 0;
  let commentRates: { label: string; rate: number; views: number; comments: number; isVideo: boolean }[] = [];
  
  const engagements = posts.map((p: any, idx: number) => {
    const likes = p.likesCount || p.likes || 0;
    const comments = p.commentsCount || 0;
    const views = p.videoViewCount || 0;
    const isVideo = p.type === 'Video' || !!p.videoUrl;
    
    totalLikes += likes;
    totalComments += comments;
    totalViews += views;
    
    const engagement = likes + comments;
    totalEngagement += engagement;
    
    let cRate = 0;
    if (views > 0) {
      cRate = (comments / views) * 100;
    }
    
    return { likes, comments, engagement, views, cRate, isVideo };
  });
  
  const n = posts.length;
  const avgEngagement = totalEngagement / n;
  const avgLikes = totalLikes / n;
  const avgComments = totalComments / n;
  
  const erLast10 = (totalEngagement / (followers * n)) * 100;
  
  let engagementVarianceSum = 0;
  let likesVarianceSum = 0;
  
  posts.forEach((p: any, i: number) => {
    engagementVarianceSum += Math.pow(engagements[i].engagement - avgEngagement, 2);
    likesVarianceSum += Math.pow(engagements[i].likes - avgLikes, 2);
    
    commentRates.push({
      label: `Post ${i + 1}`,
      rate: engagements[i].cRate,
      views: engagements[i].views,
      comments: engagements[i].comments,
      isVideo: engagements[i].isVideo
    });
  });
  
  const engagementRateVariance = engagementVarianceSum / n;
  const likesStdDev = Math.sqrt(likesVarianceSum / n);
  
  const totalVideoComments = engagements.reduce((sum: number, e: any) => sum + (e.views > 0 ? e.comments : 0), 0);
  const avgCommentRateViewBased = totalViews > 0 ? (totalVideoComments / totalViews) * 100 : 0;
  
  let recent10Engagements = posts.map((p: any, i: number) => ({
    timestamp: p.timestamp || new Date().toISOString(),
    label: `Post ${i+1}`,
    engagement: engagements[i].engagement,
    likes: engagements[i].likes,
    comments: engagements[i].comments,
  }));
  
  recent10Engagements.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  return {
    engagementRateLast10: erLast10,
    engagementRateVariance: engagementRateVariance,
    avgEngagementPerPost: avgEngagement,
    avgLikesPerPost: avgLikes,
    likesStdDev: likesStdDev,
    avgCommentsPerPost: avgComments,
    avgCommentRateViewBased: avgCommentRateViewBased,
    recent10CommentRates: commentRates,
    recent10Engagements: recent10Engagements
  };
};

export default function Dashboard() {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  const isVerifiedLocally = location.state?.isVerified;
  
  const [activeTab, setActiveTab] = useState<'Account' | 'Data'>('Account');
  const [accountData, setAccountData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [analytics, setAnalytics] = useState<DashboardMetrics | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [credibilityLoading, setCredibilityLoading] = useState(false);
  const [credibilityData, setCredibilityData] = useState<CredibilityData | null>(null);
  const [hasCalculatedCredibility, setHasCalculatedCredibility] = useState(false);
  const [credibilityError, setCredibilityError] = useState<string | null>(null);
  const [fansEngagementLoading, setFansEngagementLoading] = useState(false);
  const [fansEngagementData, setFansEngagementData] = useState<FanEngagementData | null>(null);
  const [hasCalculatedFansEngagement, setHasCalculatedFansEngagement] = useState(false);
  const [fansEngagementError, setFansEngagementError] = useState<string | null>(null);
  const [aiDebugErrors, setAiDebugErrors] = useState<AiDebugError[]>([]);
  const [showAiDebug, setShowAiDebug] = useState(false);
  const [showFollowersPopup, setShowFollowersPopup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [showCommentRates, setShowCommentRates] = useState(false);
  const [brandInput, setBrandInput] = useState<BrandInput>(
    location.state?.brandInput || {
      productCategory: 'Fashion',
      campaignGoal: 'Engagement',
      brandPositioning: 'Mass Market',
      productPrice: '',
      brandDescription: '',
    }
  );
  const [brandSubmitted, setBrandSubmitted] = useState<boolean>(
    !!(location.state?.brandInput?.productPrice && location.state?.brandInput?.brandDescription)
  );

  // Reset states when username changes
  useEffect(() => {
    if (username) {
      setHasCalculated(false);
      setHasCalculatedCredibility(false);
      setHasCalculatedFansEngagement(false);
      setAnalytics(null);
      setCredibilityData(null);
      setCredibilityError(null);
      setFansEngagementData(null);
      setFansEngagementError(null);
      setAiDebugErrors([]);
      setShowAiDebug(false);
      if (!location.state?.brandInput) {
        setBrandSubmitted(false);
        setBrandInput({ productCategory: 'Fashion', campaignGoal: 'Engagement', brandPositioning: 'Mass Market', productPrice: '', brandDescription: '' });
      }
      fetchAccountData(username);
    }
  }, [username]);

  const fetchAiDebugErrors = async () => {
    try {
      const res = await fetch('/api/ai-debug-errors');
      const data = await parseApiJson(res);
      if (res.ok && Array.isArray(data)) {
        setAiDebugErrors(data);
      }
    } catch (err) {
      console.error('Error fetching AI debug errors:', err);
    }
  };

  // Calculate generic analytics
  useEffect(() => {
    if (accountData && accountData.latestPosts && !loading && !commentsLoading && !followersLoading && followers.length >= 0) {
      if (!hasCalculated && !calculating) {
         setCalculating(true);
         setTimeout(() => {
            const metrics = calculateMetrics(accountData);
            setAnalytics(metrics);
            setCalculating(false);
            setHasCalculated(true);
         }, 1500);
      }
    }
  }, [accountData, loading, commentsLoading, followersLoading, followers, hasCalculated, calculating]);


  // Calculate followers credibility
  useEffect(() => {
    if (hasCalculated && !hasCalculatedCredibility && !credibilityLoading && brandSubmitted) {
      if (followers.length > 0) {
        setCredibilityLoading(true);
        setCredibilityError(null);
        fetch('/api/followers-credibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, followers, accountData, brandInput })
        })
        .then(async res => {
          const data = await parseApiJson(res);
          if (!res.ok) {
            throw new Error(data.error || 'Failed to assess followers credibility');
          }
          return data;
        })
        .then(data => {
           setCredibilityData(data);
           setHasCalculatedCredibility(true);
           setCredibilityLoading(false);
        })
        .catch(err => {
           console.error('Error fetching credibility:', err);
           setCredibilityError(getFriendlyApiError('Followers credibility is temporarily unavailable.', err));
           fetchAiDebugErrors();
           setHasCalculatedCredibility(true);
           setCredibilityLoading(false);
        });
      } else {
        setHasCalculatedCredibility(true);
      }
    }
  }, [accountData, hasCalculated, hasCalculatedCredibility, credibilityLoading, followers, username, brandSubmitted, brandInput]);

  useEffect(() => {
    if (hasCalculated && !hasCalculatedFansEngagement && !fansEngagementLoading) {
      const posts = accountData?.latestPosts?.slice(0, 10) || [];
      if (posts.length > 0) {
        setFansEngagementLoading(true);
        setFansEngagementError(null);
        fetch('/api/fans-content-engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, posts }),
        })
          .then(async res => {
            const data = await parseApiJson(res);
            if (!res.ok) {
              throw new Error(data.error || 'Failed to score fans content engagement');
            }
            return data;
          })
          .then(data => {
            setFansEngagementData(data);
            setHasCalculatedFansEngagement(true);
            setFansEngagementLoading(false);
          })
          .catch(err => {
            console.error('Error fetching fan engagement:', err);
            setFansEngagementError(getFriendlyApiError('Fans content engagement is temporarily unavailable.', err));
            fetchAiDebugErrors();
            setHasCalculatedFansEngagement(true);
            setFansEngagementLoading(false);
          });
      } else {
        setHasCalculatedFansEngagement(true);
      }
    }
  }, [accountData, fansEngagementLoading, hasCalculated, hasCalculatedFansEngagement, username]);

  const fetchComments = async (posts: any[]) => {
    if (!posts || posts.length === 0) return;
    setCommentsLoading(true);
    try {
      const urls = posts.slice(0, 10).map((p: any) => p.url).filter(Boolean);
      if (urls.length === 0) return;
      
      const res = await fetch('/api/apify-comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directUrls: urls }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        // Group comments by post shortcode or url
        setAccountData((prev: any) => {
          if (!prev) return prev;
          const updatedPosts = prev.latestPosts.map((post: any) => {
             const postCodeMatch = post.url ? post.url.match(/\/p\/([a-zA-Z0-9_-]+)/) || post.url.match(/\/reel\/([a-zA-Z0-9_-]+)/) : null;
             const postCode = postCodeMatch ? postCodeMatch[1] : null;
             
             const postComments = data.filter((c: any) => 
               (c.postUrl && c.postUrl.includes(post.url)) || 
               (c.shortCode && c.shortCode === postCode) ||
               (postCode && c.postUrl && c.postUrl.includes(postCode)) ||
               (c.url && post.url && c.url.includes(post.url))
             );
             
             if (postComments.length > 0) {
               return {
                 ...post,
                 latestComments: postComments
               };
             }
             return post;
          });
          
          return {
             ...prev,
             latestPosts: updatedPosts
          };
        });
      }
    } catch (err: any) {
      console.error('Error fetching comments:', err.message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const fetchFollowers = async (user: string) => {
    setFollowersLoading(true);
    try {
      const res = await fetch('/api/apify-followers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setFollowers(data);
      }
    } catch (err: any) {
      console.error('Error fetching followers:', err.message);
    } finally {
      setFollowersLoading(false);
    }
  };

  const fetchAccountData = async (user: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/apify-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch account data');
      }
      
      // Apify gives an array from run-sync-get-dataset-items
      let fetchedAccount = data;
      if (Array.isArray(data) && data.length > 0) {
        fetchedAccount = data[0];
      }
      setAccountData(fetchedAccount);

      if (fetchedAccount?.latestPosts) {
        await fetchComments(fetchedAccount.latestPosts);
      }
      await fetchFollowers(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] bg-black flex flex-col md:flex-row overflow-hidden relative text-[#F5F5F5]"
    >
      {/* Left side: Brand Input + AI Chat */}
      <div className="w-full md:w-[40%] xl:w-[35%] flex flex-col p-8 lg:p-10 relative z-10 border-r border-[#262626] bg-[#0a0a0a]">
         <div className="flex-1 overflow-y-auto mb-6 flex flex-col justify-end space-y-4 pr-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#333] hover:[&::-webkit-scrollbar-thumb]:bg-[#555] [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="bg-[#121212] border border-[#262626] p-2 rounded-2xl w-full max-w-[90%] self-start shadow-sm">
                <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ${loading ? 'bg-[#1a1a1a]' : ''}`}>
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                        {!loading ? (
                           <div className="w-6 h-6 rounded-full bg-[#262626] flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></div>
                        ) : (
                           <Loader2 size={18} className="text-gray-400 animate-spin" />
                        )}
                    </div>
                    <span className={`text-[15px] font-medium ${!loading ? 'text-gray-400' : 'text-white'}`}>Fetching user profile data</span>
                </div>
                <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ${!loading && accountData ? 'text-white' : 'text-gray-500'}`}>
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                        {!loading && accountData ? (
                           <div className="w-6 h-6 rounded-full bg-[#262626] flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></div>
                        ) : (
                           <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                        )}
                    </div>
                    <span className={`text-[15px] font-medium`}>Fetching posts</span>
                </div>
                <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ${commentsLoading ? 'bg-[#1a1a1a] text-white' : !loading && accountData && !commentsLoading ? 'text-white' : 'text-gray-500'}`}>
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                        {commentsLoading ? (
                           <Loader2 size={18} className="text-gray-400 animate-spin" />
                        ) : !loading && accountData && !commentsLoading ? (
                           <div className="w-6 h-6 rounded-full bg-[#262626] flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></div>
                        ) : (
                           <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                        )}
                    </div>
                    <span className={`text-[15px] font-medium`}>Fetching comments</span>
                </div>
                <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ${followersLoading ? 'bg-[#1a1a1a] text-white' : !loading && accountData && !commentsLoading && !followersLoading && followers.length > 0 ? 'text-white' : 'text-gray-500'}`}>
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                        {followersLoading ? (
                           <Loader2 size={18} className="text-gray-400 animate-spin" />
                        ) : !loading && accountData && !commentsLoading && !followersLoading && followers.length > 0 ? (
                           <div className="w-6 h-6 rounded-full bg-[#262626] flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></div>
                        ) : (
                           <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                        )}
                    </div>
                    <span className={`text-[15px] font-medium flex-1`}>Fetching followers</span>
                    {followers.length > 0 && !followersLoading && (
                       <button onClick={() => setShowFollowersPopup(true)} className="text-xs bg-[#333] hover:bg-[#444] text-white px-2 py-1 rounded">View</button>
                    )}
                </div>
                <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ${calculating ? 'bg-[#1a1a1a] text-white' : !loading && accountData && !commentsLoading && !followersLoading && analytics ? 'text-white' : 'text-gray-500'}`}>
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                        {calculating ? (
                           <Loader2 size={18} className="text-gray-400 animate-spin" />
                        ) : !loading && accountData && !commentsLoading && !followersLoading && analytics ? (
                           <div className="w-6 h-6 rounded-full bg-[#262626] flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></div>
                        ) : (
                           <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                        )}
                    </div>
                    <span className={`text-[15px] font-medium flex-1`}>Calculating analytics</span>
                </div>
                <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ${credibilityLoading ? 'bg-[#1a1a1a] text-white' : hasCalculatedCredibility ? 'text-white' : 'text-gray-500'}`}>
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                        {credibilityLoading ? (
                           <Loader2 size={18} className="text-gray-400 animate-spin" />
                        ) : hasCalculatedCredibility ? (
                           <div className="w-6 h-6 rounded-full bg-[#262626] flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></div>
                        ) : (
                           <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                        )}
                    </div>
                    <span className={`text-[15px] font-medium flex-1`}>Scoring match</span>
                </div>
                <div className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 ${fansEngagementLoading ? 'bg-[#1a1a1a] text-white' : hasCalculatedFansEngagement ? 'text-white' : 'text-gray-500'}`}>
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                        {fansEngagementLoading ? (
                           <Loader2 size={18} className="text-gray-400 animate-spin" />
                        ) : hasCalculatedFansEngagement ? (
                           <div className="w-6 h-6 rounded-full bg-[#262626] flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></div>
                        ) : (
                           <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
                        )}
                    </div>
                    <span className={`text-[15px] font-medium flex-1`}>Scoring fans content engagement</span>
                </div>
            </div>
         </div>


         {brandSubmitted && (
           <div className="mt-4 bg-[#121212] border border-[#262626] rounded-2xl p-4 shrink-0">
             <div className="flex items-center justify-between">
               <div>
                 <div className="text-xs text-gray-500 uppercase tracking-wider">Campaign</div>
                 <div className="text-sm font-semibold text-white mt-0.5">{brandInput.productCategory} · {brandInput.campaignGoal} · {brandInput.brandPositioning}</div>
                 <div className="text-xs text-gray-500 mt-0.5">${brandInput.productPrice} product</div>
               </div>
             </div>
           </div>
         )}
      </div>

      {/* Right side: Account details */}
      <div className="w-full md:w-[60%] xl:w-[65%] p-4 md:p-8 lg:p-12 h-screen overflow-hidden flex flex-col relative z-10 bg-black">
        {/* Toggle */}
        <div className="flex bg-[#121212] p-1 rounded-full mb-8 w-64 border border-[#262626] self-end shrink-0">
          <button 
            className={`flex-1 py-1.5 text-sm font-medium rounded-full transition-all ${activeTab === 'Account' ? 'bg-[#262626] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('Account')}
          >
            Account
          </button>
          <button 
            className={`flex-1 py-1.5 text-sm font-medium rounded-full transition-all ${activeTab === 'Data' ? 'bg-[#262626] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('Data')}
          >
            Data
          </button>
        </div>

        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#262626] hover:[&::-webkit-scrollbar-thumb]:bg-[#444] [&::-webkit-scrollbar-thumb]:rounded-full pb-10">
          {activeTab === 'Account' && (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="h-full"
            >
              {loading ? (
                <div className="animate-pulse flex flex-col max-w-[935px] mx-auto w-full pt-4 md:pt-8 px-4">
                  <div className="flex items-start mb-8 md:mb-10">
                    <div className="mr-6 md:mr-16 shrink-0 md:ml-4">
                      <div className="w-20 h-20 md:w-36 md:h-36 bg-[#262626] rounded-full"></div>
                    </div>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center mb-5 h-8">
                        <div className="w-32 h-6 bg-[#262626] rounded"></div>
                      </div>
                      <div className="flex gap-4 md:gap-10 mb-5">
                        <div className="w-16 h-4 bg-[#262626] rounded"></div>
                        <div className="w-24 h-4 bg-[#262626] rounded"></div>
                        <div className="w-24 h-4 bg-[#262626] rounded"></div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="w-24 h-4 bg-[#262626] rounded"></div>
                        <div className="w-full max-w-sm h-4 bg-[#262626] rounded"></div>
                        <div className="w-2/3 max-w-sm h-4 bg-[#262626] rounded"></div>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[#262626]">
                    <div className="grid grid-cols-3 gap-1 md:gap-2 mt-1 md:mt-2">
                      <div className="aspect-square bg-[#121212]"></div>
                      <div className="aspect-square bg-[#121212]"></div>
                      <div className="aspect-square bg-[#121212]"></div>
                      <div className="aspect-square bg-[#121212]"></div>
                      <div className="aspect-square bg-[#121212]"></div>
                      <div className="aspect-square bg-[#121212]"></div>
                    </div>
                  </div>
                </div>
              ) : error ? (
                 <div className="text-red-400 text-center py-8 bg-red-950/20 rounded-2xl mx-4">
                   <p className="font-semibold">{error}</p>
                   <p className="text-sm mt-2 text-red-400/80">Check if APIFY_API_TOKEN is set in settings.</p>
                 </div>
              ) : accountData ? (
                <div className="flex flex-col max-w-[935px] mx-auto w-full pt-4 md:pt-8 px-2 md:px-4">
                  <div className="flex items-start mb-8 md:mb-12">
                     <div className="mr-6 md:mr-16 shrink-0 md:ml-4">
                        <img 
                          src={`/api/image?url=${encodeURIComponent(accountData.profilePicUrlHD || accountData.profilePicUrl)}`}
                          alt={accountData.username} 
                          className="w-20 h-20 md:w-36 md:h-36 rounded-full object-cover border border-[#262626]"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'; 
                          }}
                        />
                     </div>
                     <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center mb-4 gap-3 flex-wrap">
                           <h2 className="text-[20px] md:text-[24px] leading-5 md:leading-6 truncate">{accountData.username}</h2>
                           {(accountData.isVerified || isVerifiedLocally) && (
                             <svg aria-label="Verified" className="shrink-0" fill="rgb(0, 149, 246)" height="18" role="img" viewBox="0 0 40 40" width="18">
                                <title>Verified</title>
                                <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fillRule="evenodd" />
                             </svg>
                           )}
                           <button className="hover:bg-[#262626] p-1.5 rounded-full transition-colors shrink-0">
                             <MoreHorizontal className="w-6 h-6 text-white" />
                           </button>
                        </div>
                        <div className="flex gap-6 md:gap-10 mb-4 text-[14px] md:text-[16px] flex-wrap leading-tight">
                           <span><span className="font-semibold text-white">{accountData.postsCount?.toLocaleString() || '0'}</span> posts</span>
                           <span><span className="font-semibold text-white">{accountData.followersCount?.toLocaleString() || '0'}</span> followers</span>
                           <span><span className="font-semibold text-white">{accountData.followsCount?.toLocaleString() || '0'}</span> following</span>
                        </div>
                        <div className="text-[14px] md:text-[15px] space-y-1">
                           <div className="font-semibold text-[#F5F5F5] break-words">{accountData.fullName}</div>
                           {accountData.biography && (
                             <div className="whitespace-pre-wrap break-words">{accountData.biography}</div>
                           )}
                           {accountData.externalUrl && (
                             <a href={accountData.externalUrl} target="_blank" rel="noopener noreferrer" className="text-[#E0E0E0] font-medium hover:underline block break-all">
                               {accountData.externalUrl.replace(/^https?:\/\//, '')}
                             </a>
                           )}
                        </div>
                     </div>
                  </div>
                  
                  {/* Empty Posts Section */}
                  <div className="border-t border-[#262626] mt-8">
                     <div className="flex justify-center -mt-[1px] mb-2">
                        <div className="flex items-center gap-2 border-t border-white pt-4 px-1 text-[13px] font-semibold tracking-wider text-white">
                           <svg aria-label="" fill="currentColor" height="12" role="img" viewBox="0 0 24 24" width="12">
                             <rect fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" width="18" x="3" y="3"></rect>
                             <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="9.015" x2="9.015" y1="3" y2="21"></line>
                             <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="14.985" x2="14.985" y1="3" y2="21"></line>
                             <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="21" x2="3" y1="9.015" y2="9.015"></line>
                             <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="21" x2="3" y1="14.985" y2="14.985"></line>
                           </svg>
                           POSTS
                        </div>
                     </div>
                     <div className="grid grid-cols-3 gap-1 md:gap-2">
                        {accountData.latestPosts && accountData.latestPosts.length > 0 ? (
                           accountData.latestPosts.map((post: any, idx: number) => (
                              <div key={post.id || idx} className="aspect-square bg-[#121212] overflow-hidden group relative cursor-pointer" onClick={() => setSelectedPost(post)}>
                                 <img 
                                    src={`/api/image?url=${encodeURIComponent(post.displayUrl || post.thumbnailUrl || (post.images && post.images.length > 0 ? post.images[0] : ''))}`} 
                                    alt={post.caption || ''} 
                                    className="w-full h-full object-cover" 
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                       (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'; 
                                    }}
                                 />
                                 {(post.type === 'Video' || post.videoUrl) && (
                                    <div className="absolute top-2 right-2 text-white drop-shadow-md">
                                      <Play size={20} fill="currentColor" className="opacity-90" />
                                    </div>
                                 )}
                                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white font-semibold z-10">
                                    <div className="flex items-center gap-1.5"><Heart size={18} fill="currentColor" /> {post.likesCount?.toLocaleString() || post.likes || '0'}</div>
                                    <div className="flex items-center gap-1.5"><MessageCircle size={18} fill="currentColor" /> {post.commentsCount?.toLocaleString() || '0'}</div>
                                 </div>
                              </div>
                           ))
                        ) : (
                           Array.from({ length: 9 }).map((_, idx) => (
                              <div key={idx} className="aspect-square bg-[#121212] overflow-hidden group relative">
                              </div>
                           ))
                        )}
                     </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 mt-10">No data found</div>
              )}
            </motion.div>
          )}

          {activeTab === 'Data' && (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="h-full flex flex-col px-2 md:px-4"
            >
              <div className="space-y-6 pb-20">
                  {credibilityError && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-4 text-red-300">
                      <div className="font-semibold text-red-200 mb-1">Credibility assessment failed</div>
                      <div className="text-sm">{credibilityError}</div>
                    </div>
                  )}
                  {fansEngagementError && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-4 text-red-300">
                      <div className="font-semibold text-red-200 mb-1">Fans content engagement failed</div>
                      <div className="text-sm">{fansEngagementError}</div>
                    </div>
                  )}
                  {(credibilityError || fansEngagementError || aiDebugErrors.length > 0) && (
                    <div className="bg-[#101010] border border-[#262626] rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-white">AI debug</div>
                          <div className="text-xs text-gray-400">Recent model parse/provider issues for troubleshooting.</div>
                        </div>
                        <button
                          onClick={async () => {
                            await fetchAiDebugErrors();
                            setShowAiDebug((prev) => !prev);
                          }}
                          className="text-xs bg-[#262626] hover:bg-[#333] text-white px-3 py-1.5 rounded-full transition-colors"
                        >
                          {showAiDebug ? 'Hide errors' : 'View errors'}
                        </button>
                      </div>
                      {showAiDebug && (
                        <div className="mt-4 space-y-3">
                          {aiDebugErrors.length === 0 ? (
                            <div className="text-sm text-gray-400">No recent AI debug errors recorded.</div>
                          ) : (
                            aiDebugErrors.slice(0, 6).map((item) => (
                              <div key={item.id} className="bg-black/40 border border-[#262626] rounded-xl p-3">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <span className="text-xs font-semibold text-white">{item.label}</span>
                                  <span className="text-[11px] text-gray-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-xs text-red-300 mb-2">{item.message}</div>
                                <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-words font-mono leading-5">
                                  {item.snippet}
                                </pre>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="text-white" size={24} />
                    <h2 className="text-2xl font-bold text-white">AI summary</h2>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4">
                    {!hasCalculatedCredibility || credibilityLoading ? (
                      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 mt-2 min-h-[280px] relative overflow-hidden">
                        {!brandSubmitted ? (
                          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                            <div className="w-12 h-12 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center">
                              <Activity size={20} className="text-gray-600" />
                            </div>
                            <div className="text-sm font-semibold text-white">Followers Credibility</div>
                            <div className="text-xs text-gray-500 max-w-[200px] leading-5">Fill in your brand info on the left to calculate the match score</div>
                          </div>
                        ) : (
                          <SummaryScoreSkeleton />
                        )}
                      </div>
                    ) : hasCalculatedCredibility && credibilityData && followers.length > 0 ? (
                      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 mt-2 min-h-[280px] relative overflow-hidden">
                        {(() => {
                          const tone = getCredibilityTone(credibilityData.averageScore);
                          const radius = 58;
                          const circumference = 2 * Math.PI * radius;
                          const progress = Math.max(0, Math.min(100, credibilityData.averageScore));
                          const dashOffset = circumference * (1 - progress / 100);

                          return (
                            <>
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_38%)] pointer-events-none" />
                              <div className="relative flex flex-col items-center md:flex-row md:items-center gap-8 h-full">
                                <div className="relative shrink-0">
                                  <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
                                    <circle cx="74" cy="74" r={radius} fill="none" stroke="#262626" strokeWidth="12" />
                                    <circle
                                      cx="74"
                                      cy="74"
                                      r={radius}
                                      fill="none"
                                      stroke={tone.color}
                                      strokeWidth="12"
                                      strokeLinecap="round"
                                      strokeDasharray={circumference}
                                      strokeDashoffset={dashOffset}
                                    />
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                    <div className={`text-4xl font-black leading-none ${tone.textClass}`}>{credibilityData.averageScore}</div>
                                    <div className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-gray-500">out of 100</div>
                                  </div>
                                </div>

                                <div className="text-center md:text-left">
                                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500 mb-1">Match Score</div>
                                  <div className="text-xl font-bold text-white mb-3">Influencer Match</div>
                                  <div className={`inline-flex text-sm font-bold px-4 py-1.5 rounded-full ${tone.badgeClass}`}>
                                    {tone.label}
                                  </div>
                                  <p className="mt-4 text-sm leading-7 text-gray-300 max-w-sm">
                                    How well this influencer fits your brand, campaign goal, and audience.
                                  </p>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <SummaryScoreSkeleton />
                    )}

                    {!hasCalculatedFansEngagement || fansEngagementLoading ? (
                      <SummaryScoreSkeleton />
                    ) : hasCalculatedFansEngagement && fansEngagementData ? (
                      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 mt-2 min-h-[280px] relative overflow-hidden">
                        {(() => {
                          const tone = getFanEngagementTone(fansEngagementData.averageScore);
                          const radius = 58;
                          const circumference = 2 * Math.PI * radius;
                          const progress = Math.max(0, Math.min(100, fansEngagementData.averageScore));
                          const dashOffset = circumference * (1 - progress / 100);

                          return (
                            <>
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_38%)] pointer-events-none" />
                              <div className="relative flex flex-col items-center md:flex-row md:items-center gap-8 h-full">
                                <div className="relative shrink-0">
                                  <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
                                    <circle cx="74" cy="74" r={radius} fill="none" stroke="#262626" strokeWidth="12" />
                                    <circle
                                      cx="74"
                                      cy="74"
                                      r={radius}
                                      fill="none"
                                      stroke={tone.color}
                                      strokeWidth="12"
                                      strokeLinecap="round"
                                      strokeDasharray={circumference}
                                      strokeDashoffset={dashOffset}
                                    />
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                    <div className={`text-4xl font-black leading-none ${tone.textClass}`}>{fansEngagementData.averageScore}</div>
                                    <div className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-gray-500">out of 100</div>
                                  </div>
                                </div>

                                <div className="text-center md:text-left">
                                  <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
                                    Fans Content Engagement
                                  </div>
                                  <div className={`inline-flex text-sm font-bold px-4 py-1.5 rounded-full ${tone.badgeClass}`}>
                                    {tone.label}
                                  </div>
                                  <p className="mt-4 text-sm leading-7 text-gray-300 max-w-sm">
                                    AI compares each recent post with its actual comments to judge how relevant, genuine, and healthy the audience engagement looks.
                                  </p>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <SummaryScoreSkeleton />
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <BarChart2 className="text-white" size={24} />
                    <h2 className="text-2xl font-bold text-white">Analytics Overview</h2>
                  </div>
                  
                  {!analytics ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <AnalyticsCardSkeleton />
                        <AnalyticsCardSkeleton />
                        <AnalyticsCardSkeleton />
                        <AnalyticsCardSkeleton />
                        <AnalyticsCardSkeleton wide />
                      </div>
                      <ChartSkeleton />
                    </>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     {/* Engagement Rate */}
                     <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                           <div className="text-gray-400 text-sm font-medium">Engagement Rate (Last 10 Posts)</div>
                           <div className="p-2 bg-pink-500/10 rounded-lg">
                              <Activity className="text-pink-500" size={20} />
                           </div>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                           <div className="text-3xl font-bold text-white">{analytics.engagementRateLast10.toFixed(2)}%</div>
                           {accountData && (() => {
                             const tone = getEngagementTone(accountData.followersCount || 0, analytics.engagementRateLast10);
                             return (
                               <div className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${tone.colorClass}`}>
                                 {tone.label}
                               </div>
                             );
                           })()}
                        </div>
                        <div className="text-xs text-green-400 font-medium">Variance: {analytics.engagementRateVariance.toFixed(2)}</div>
                     </div>
                     
                     {/* Avg Engagement */}
                     <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                           <div className="text-gray-400 text-sm font-medium">Avg Engagement Per Post</div>
                           <div className="p-2 bg-blue-500/10 rounded-lg">
                              <TrendingUp className="text-blue-500" size={20} />
                           </div>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">{Math.round(analytics.avgEngagementPerPost).toLocaleString()}</div>
                     </div>
                     
                     {/* Avg Likes */}
                     <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                           <div className="text-gray-400 text-sm font-medium">Avg Likes Per Post</div>
                           <div className="p-2 bg-red-500/10 rounded-lg">
                              <Heart className="text-red-500" size={20} />
                           </div>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">{Math.round(analytics.avgLikesPerPost).toLocaleString()}</div>
                        <div className="text-xs text-gray-500 font-medium">Std Dev: {Math.round(analytics.likesStdDev).toLocaleString()}</div>
                     </div>

                     {/* Avg Comments */}
                     <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                           <div className="text-gray-400 text-sm font-medium">Avg Comments Per Post</div>
                           <div className="p-2 bg-purple-500/10 rounded-lg">
                              <MessageCircle className="text-purple-500" size={20} />
                           </div>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">{Math.round(analytics.avgCommentsPerPost).toLocaleString()}</div>
                     </div>
                     
                     {/* Avg Comment Rate */}
                     <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 lg:col-span-2 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                           <div className="text-gray-400 text-sm font-medium">Avg Comment Rate (View Based - Videos Only)</div>
                           <div className="p-2 bg-amber-500/10 rounded-lg">
                              <Eye className="text-amber-500" size={20} />
                           </div>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">{analytics.avgCommentRateViewBased.toFixed(4)}%</div>
                     </div>
                  </div>
                  )}

                  {/* Engagement Trend Graph */}
                  {analytics ? (
                  <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 mt-6">
                     <div className="flex items-center gap-2 mb-6">
                        <Activity className="text-blue-400" size={24} />
                        <h3 className="text-lg font-bold text-white">Engagement Trend (Recent 10 posts)</h3>
                     </div>
                     <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                           <AreaChart data={analytics.recent10Engagements}>
                              <defs>
                                 <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                 </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                              <XAxis dataKey="label" stroke="#666" tick={{fill: '#666', fontSize: 12}} />
                              <YAxis stroke="#666" tick={{fill: '#666', fontSize: 12}} tickFormatter={(val) => Math.round(val / 1000) + 'k'} width={45} />
                              <Tooltip 
                                 contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff' }}
                                 itemStyle={{ color: '#fff' }}
                              />
                              <Area type="monotone" dataKey="engagement" name="Engagement" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorEngagement)" />
                           </AreaChart>
                        </ResponsiveContainer>
                     </div>
                  </div>
                  ) : null}

                  {/* End of analytics content */}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Post Modal Preview */}
      <AnimatePresence>
        {selectedPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedPost(null)}>
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               onClick={(e) => e.stopPropagation()}
               className="bg-black border border-[#262626] rounded-md flex flex-col md:flex-row max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl relative"
            >
               <button 
                  onClick={() => setSelectedPost(null)}
                  className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors md:hidden"
               >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
               </button>
               
               <div className="w-full md:w-[60%] bg-[#121212] flex items-center justify-center relative min-h-[40vh] border-r border-[#262626]">
                 {(selectedPost.type === 'Video' || selectedPost.videoUrl) ? (
                    <video 
                       src={`/api/image?url=${encodeURIComponent(selectedPost.videoUrl)}`}
                       controls
                       autoPlay
                       loop
                       muted
                       className="max-w-full max-h-[60vh] md:max-h-[90vh] object-contain"
                       onError={(e) => {
                         const target = e.target as HTMLVideoElement;
                         const img = document.createElement('img');
                         img.src = `/api/image?url=${encodeURIComponent(selectedPost.displayUrl || selectedPost.thumbnailUrl || '')}`;
                         img.className = target.className;
                         target.replaceWith(img);
                       }}
                    />
                 ) : (
                    <img 
                       src={`/api/image?url=${encodeURIComponent(selectedPost.displayUrl || selectedPost.thumbnailUrl || (selectedPost.images && selectedPost.images.length > 0 ? selectedPost.images[0] : ''))}`} 
                       alt="" 
                       className="max-w-full max-h-[60vh] md:max-h-[90vh] object-contain" 
                       referrerPolicy="no-referrer" 
                       onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'; 
                       }}
                    />
                 )}
               </div>
               
               <div className="w-full md:w-[40%] flex flex-col h-[50vh] md:h-auto bg-black">
                 {/* Header */}
                 <div className="flex items-center gap-3 border-b border-[#262626] p-4 shrink-0">
                    <img 
                       src={`/api/image?url=${encodeURIComponent(accountData.profilePicUrlHD || accountData.profilePicUrl)}`} 
                       className="w-8 h-8 rounded-full object-cover" 
                       referrerPolicy="no-referrer"
                    />
                    <span className="font-semibold text-[14px] text-white">{accountData.username}</span>
                    {(accountData.isVerified || isVerifiedLocally) && (
                      <svg aria-label="Verified" className="shrink-0" fill="rgb(0, 149, 246)" height="14" role="img" viewBox="0 0 40 40" width="14">
                         <title>Verified</title>
                         <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fillRule="evenodd" />
                      </svg>
                    )}
                 </div>
                 
                 {/* Caption & Comments Area */}
                 <div className="flex-1 overflow-y-auto p-4 text-[14px] whitespace-pre-wrap text-white [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#333] hover:[&::-webkit-scrollbar-thumb]:bg-[#555]">
                   {selectedPost.caption && (
                      <div className="mb-4">
                         <span className="font-semibold mr-2">{accountData.username}</span>
                         <span>{selectedPost.caption}</span>
                      </div>
                   )}
                   {selectedPost.latestComments && selectedPost.latestComments.length > 0 && (
                      <div className="space-y-4 mt-6">
                         {selectedPost.latestComments.map((comment: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-3">
                               <div className="w-8 h-8 rounded-full bg-[#262626] shrink-0 overflow-hidden">
                                  <img src={`/api/image?url=${encodeURIComponent(comment.ownerProfilePicUrl || '')}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                               </div>
                               <div>
                                  <span className="font-semibold mr-2">{comment.ownerUsername}</span>
                                  <span>{comment.text}</span>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                 </div>
                 
                 {/* Stats & Actions */}
                 <div className="border-t border-[#262626] p-4 shrink-0 bg-black">
                   <div className="flex items-center gap-4 mb-3">
                     <button className="hover:text-gray-400 transition-colors"><Heart size={24} /></button>
                     <button className="hover:text-gray-400 transition-colors"><MessageCircle size={24} /></button>
                     <button className="hover:text-gray-400 transition-colors"><Send size={24} /></button>
                   </div>
                   <div className="font-semibold text-[14px] text-white">{(selectedPost.likesCount || selectedPost.likes || 0).toLocaleString()} likes</div>
                   {selectedPost.timestamp && (
                     <div className="text-[12px] text-gray-500 uppercase mt-1">
                        {new Date(selectedPost.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                     </div>
                   )}
                 </div>
                 
                 {/* Add Comment */}
                 <div className="border-t border-[#262626] p-4 shrink-0 flex items-center bg-black">
                    <input type="text" placeholder="Add a comment..." className="bg-transparent border-none outline-none w-full text-[14px] text-white placeholder-gray-500" />
                    <button className="text-blue-500 font-semibold text-[14px] shrink-0 ml-2 hover:text-white transition-colors">Post</button>
                 </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Followers Modal */}
      <AnimatePresence>
        {showFollowersPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-sm" onClick={() => setShowFollowersPopup(false)}>
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               onClick={(e) => e.stopPropagation()}
               className="bg-[#121212] border border-[#262626] rounded-2xl flex flex-col max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl relative"
            >
               <div className="flex justify-between items-center p-6 border-b border-[#262626]">
                 <h3 className="text-xl font-bold text-white">100 Followers (Raw Data)</h3>
                 <button 
                    onClick={() => setShowFollowersPopup(false)}
                    className="bg-[#262626] hover:bg-[#333] text-white rounded-full p-2 transition-colors"
                 >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
               </div>
               <div className="p-6 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#333]">
                 <pre className="text-[13px] text-gray-300 whitespace-pre-wrap flex-1 font-mono">
                    {JSON.stringify(followers, null, 2)}
                 </pre>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

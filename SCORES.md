# Scoring System — Full Reference

This document covers every score the system produces, how it is calculated, and exactly what the user sees on the dashboard (`/dashboard/:username` → **Data** tab).

---


## 1. Fans Content Engagement Score

**Where it appears:** Data tab → "AI Summary" section → right card (circular gauge)

**What it measures:** How genuine, relevant, and healthy the audience engagement is on each post — comparing actual comments against what a real fan would say given the post's content and tone.

**How it is calculated:**
1. Each post's media (image or video) is uploaded to Gemini and analyzed → produces a `post_description` (content type, topic, tone, expected reactions, expected comment themes).
2. The post descriptions + actual comments are sent to a second Gemini model which scores each post 0–100.
3. The average of all post scores is the final `averageScore`.

**Scoring weights inside the model prompt:**

| Dimension | Weight |
|-----------|--------|
| Genuine relevance of comments to the post | 60% |
| Low generic / bot-like comment ratio | 25% |
| Low negativity / toxicity | 15% |

**Score ranges and what the UI shows:**

| Score | Badge label | Badge color | Gauge color | Radial gradient tint |
|-------|-------------|-------------|-------------|----------------------|
| 75 – 100 | **Highly relevant** | Sky blue | `#38bdf8` | Sky blue |
| 50 – 74 | **Mixed quality** | Amber | `#f59e0b` | Amber |
| 0 – 49 | **Weak alignment** | Red | `#ef4444` | Red |

**Comment classification the model uses:**

| Type | Score impact |
|------|-------------|
| Directly references the post topic or a specific moment | Positive (genuine) |
| Emoji matching the post tone (😂 on funny, 😭 on sad) | Positive (genuine) |
| Questions about product, location, or topic shown | Positive (genuine) |
| Generic praise ("Nice post!", "Love this 🔥") | Slight negative (generic) |
| Promotional spam / "follow me back" | Slight negative (generic) |
| Copy-paste identical comments from multiple users | Negative (bot signal) |
| Personal attacks on the creator | Negative |
| Hate speech / slurs / harassment | Heavy negative |

---

## 2. Engagement Rate (Last 10 Posts)

**Where it appears:** Data tab → "Analytics Overview" section → first card

**Formula:**
```
engagementRateLast10 = (total likes + comments across last 10 posts) / (followersCount × 10) × 100
```

**What the UI shows:** The percentage value + a colored badge based on follower tier:

| Follower tier | Poor | Average | Good | Excellent |
|---------------|------|---------|------|-----------|
| < 10k | < 1.1% | 1.1% | ≥ 2.0% | ≥ 5.0% |
| 10k – 50k | < 0.9% | 0.9% | ≥ 1.5% | ≥ 3.5% |
| 50k – 500k | < 0.8% | 0.8% | ≥ 1.2% | ≥ 2.5% |
| 500k – 1M | < 0.7% | 0.7% | ≥ 1.0% | ≥ 2.0% |
| ≥ 1M | < 0.7% | 0.7% | ≥ 1.0% | ≥ 2.0% |

**Badge colors:**

| Label | Color |
|-------|-------|
| Excellent | Green |
| Good | Blue |
| Average | Amber |
| Poor | Red |

Also shows **Variance** below the rate (raw variance of per-post engagement values).

---

## 3. Avg Engagement Per Post

**Where it appears:** Data tab → "Analytics Overview" → second card

**Formula:**
```
avgEngagementPerPost = (total likes + comments across last 10 posts) / 10
```

Displayed as a rounded integer. No badge — purely informational.

---

## 4. Avg Likes Per Post

**Where it appears:** Data tab → "Analytics Overview" → third card

**Formula:**
```
avgLikesPerPost = total likes across last 10 posts / 10
```

Also shows **Std Dev** (standard deviation of likes per post) below the main number.

---

## 5. Avg Comments Per Post

**Where it appears:** Data tab → "Analytics Overview" → fourth card

**Formula:**
```
avgCommentsPerPost = total comments across last 10 posts / 10
```

Displayed as a rounded integer. No badge.

---

## 6. Avg Comment Rate (View-Based, Videos Only)

**Where it appears:** Data tab → "Analytics Overview" → fifth card (spans 2 columns)

**Formula:**
```
avgCommentRateViewBased = (total comments on video posts) / (total video views) × 100
```

Only counts posts that have `videoViewCount > 0`. Displayed to 4 decimal places (e.g. `0.0032%`). Shows `0.0000%` if no video posts exist.

---

## 7. Engagement Trend Chart

**Where it appears:** Data tab → below the analytics cards

**What it shows:** An area chart of `likes + comments` per post for the last 10 posts, sorted chronologically (oldest → newest). Hovering shows exact likes and comments per post.

No score — purely visual.

---

## Score Loading States

All score cards show an animated skeleton while calculating. The left panel shows the step-by-step progress:

| Step | Triggers when |
|------|--------------|
| Fetching user profile data | Account API call in progress |
| Fetching posts | Account data received |
| Fetching comments | Comment API call in progress |
| Fetching followers | Followers API call in progress |
| Calculating analytics | 1.5s after all data is loaded |
| Assessing credibility | After analytics are calculated + followers exist |
| Scoring fans content engagement | After analytics are calculated + posts exist |

If **Assessing credibility** fails, a red error banner appears at the top of the Data tab with the message and an **AI debug** panel that shows the raw model/provider error for troubleshooting.

import sys
import json
import numpy as np
import pandas as pd
import joblib

MODEL_PATH = "model.joblib"

CAT_COLS = [
    "product_category",
    "campaign_goal",
    "brand_positioning",
    "influencer_category",
]

DEFAULTS = {
    "influencer_category": "Micro",
    "followers_count": 0.0,
    "follower_growth_30d": 0.0,
    "engagement_rate": 0.0,
    "avg_engagement_per_post": 0.0,
    "active_followers_ratio": 0.5,
    "bot_probability_avg": 0.1,
    "comment_sentiment_avg": 0.5,
    "duplicate_comment_ratio": 0.0,
    "posting_consistency": 0.5,
    "post_frequency": 4.0,
    "audience_age_mean": 27.0,
    "product_category": "Fashion",
    "campaign_goal": "Engagement",
    "brand_positioning": "Mass Market",
    "product_price": 25.0,
    "category_match_score": 0.5,
    "audience_product_fit": 0.5,
    "price_fit_score": 0.5,
    "brand_fit_score": 0.5,
    "engagement_weight_context": 0.5,
}

VALID_VALUES = {
    "influencer_category": {"Mega", "Macro", "Micro", "Nano"},
    "product_category": {"Beauty", "Fashion", "Tech", "Food", "Travel", "Fitness", "Gaming", "Finance", "Home", "Education"},
    "campaign_goal": {"Awareness", "Conversion", "Engagement", "Retention"},
    "brand_positioning": {"Luxury", "Premium", "Mass Market", "Budget"},
}

def sanitize(features):
    result = {}
    for key, default in DEFAULTS.items():
        val = features.get(key, default)
        if val is None:
            val = default
        if key in VALID_VALUES and val not in VALID_VALUES[key]:
            val = default
        result[key] = val
    return result

def main():
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            raise ValueError("No input received on stdin")

        features = json.loads(raw)
        features = sanitize(features)

        obj = joblib.load(MODEL_PATH)
        pipeline = obj["pipeline"]
        num_cols = obj["num_cols"]

        df = pd.DataFrame([features])
        for col in num_cols:
            if col not in df.columns:
                df[col] = 0.0

        df = df[num_cols + CAT_COLS]
        score = float(np.clip(pipeline.predict(df)[0], 0.0, 1.0))
        print(json.dumps({"match_score": round(score, 4)}))
        sys.exit(0)
    except Exception as e:
        sys.stderr.write(f"predict_once error: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

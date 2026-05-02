import numpy as np
import pandas as pd
import joblib
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Literal


# ── Constants ─────────────────────────────────────────────────────────────────

MODEL_PATH = "model.joblib"

CAT_COLS = [
    "product_category",
    "campaign_goal",
    "brand_positioning",
    "influencer_category",
]


# ── App lifespan ──────────────────────────────────────────────────────────────

state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    obj = joblib.load(MODEL_PATH)
    state["pipeline"] = obj["pipeline"]
    state["num_cols"] = obj["num_cols"]
    print("✅ Model loaded")
    yield
    state.clear()


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Influencer Match Score API",
    description="Returns a 0–1 match score for an influencer × brand combination.",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class MatchRequest(BaseModel):
    # Influencer
    influencer_category:      Literal["Mega", "Macro", "Micro", "Nano"] = Field(..., example="Micro")
    followers_count:          float = Field(..., example=85000)
    follower_growth_30d:      float = Field(..., example=0.04)
    engagement_rate:          float = Field(..., example=0.062)
    avg_engagement_per_post:  float = Field(..., example=520)
    active_followers_ratio:   float = Field(..., example=0.78)
    bot_probability_avg:      float = Field(..., example=0.05)
    comment_sentiment_avg:    float = Field(..., example=0.72)
    duplicate_comment_ratio:  float = Field(..., example=0.02)
    posting_consistency:      float = Field(..., example=0.85)
    post_frequency:           float = Field(..., example=4.5)
    audience_age_mean:        float = Field(..., example=27.3)

    # Brand / campaign
    product_category:  Literal["Beauty", "Fashion", "Tech", "Food", "Travel",
                                "Fitness", "Gaming", "Finance", "Home", "Education"] = Field(..., example="Beauty")
    campaign_goal:     Literal["Awareness", "Conversion", "Engagement", "Retention"] = Field(..., example="Awareness")
    brand_positioning: Literal["Luxury", "Premium", "Mass Market", "Budget"] = Field(..., example="Premium")
    product_price:     float = Field(..., example=49.99)

    # Fit scores
    category_match_score:      float = Field(0.5, ge=0, le=1, example=0.82)
    audience_product_fit:      float = Field(0.5, ge=0, le=1, example=0.75)
    price_fit_score:           float = Field(0.5, ge=0, le=1, example=0.68)
    brand_fit_score:           float = Field(0.5, ge=0, le=1, example=0.79)
    engagement_weight_context: float = Field(0.5, ge=0, le=1, example=0.61)


class MatchResponse(BaseModel):
    match_score: float = Field(..., description="0–1 score — higher means better fit")
    verdict:     str   = Field(..., description="Plain-language interpretation")


# ── Helper ────────────────────────────────────────────────────────────────────

def interpret(score: float) -> str:
    if score >= 0.80: return "Excellent match — highly recommended"
    if score >= 0.65: return "Good match — worth considering"
    if score >= 0.50: return "Moderate match — proceed with caution"
    return "Poor match — not recommended"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/predict", response_model=MatchResponse, tags=["Scoring"])
def predict_match(body: MatchRequest):
    pipeline = state["pipeline"]
    num_cols = state["num_cols"]

    df = pd.DataFrame([body.model_dump()])

    for col in num_cols:
        if col not in df.columns:
            df[col] = 0.0

    df = df[num_cols + CAT_COLS]

    score = float(np.clip(pipeline.predict(df)[0], 0.0, 1.0))

    return MatchResponse(match_score=round(score, 4), verdict=interpret(score))


@app.get("/health", tags=["Meta"])
def health():
    return {"status": "ok", "model_loaded": "pipeline" in state}
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer, util
import uvicorn
import os

app = FastAPI(title="SkillGap V2 ML Engine")
model = SentenceTransformer('all-MiniLM-L6-v2')

# Set this in your environment, or default to a strong string
SECRET_ML_KEY = os.getenv("ML_ENGINE_SECRET", "super_secret_internal_key_123")

class MarketSkill(BaseModel):
    name: str
    domain: str
    type: str

class SemanticMatchRequest(BaseModel):
    user_skills: List[str]
    market_skills: List[MarketSkill]

@app.post("/semantic-match")
def semantic_match(request: SemanticMatchRequest, x_api_key: str = Header(None)):
    if x_api_key != SECRET_ML_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized ML Access")
    
    user_skills = request.user_skills
    market_skills = request.market_skills
    
    if not market_skills:
        raise HTTPException(status_code=400, detail="market_skills array cannot be empty")
        
    # Handle empty user skills gracefully without breaking text embedding matrix shapes
    cleaned_user_skills = [skill for skill in user_skills if skill.strip()]
    if not cleaned_user_skills:
        cleaned_user_skills = [""]

    # --- BATCH EMBEDDING (The Right Way) ---
    # Extract all text elements into clean lists and encode them in exactly TWO parallel batch passes
    market_names = [ms.name for ms in market_skills]
    
    user_embeddings = model.encode(cleaned_user_skills, convert_to_tensor=True)
    market_embeddings = model.encode(market_names, convert_to_tensor=True)
    
    # --- MATRIX SIMILARITY ---
    # Computes an [M x U] matrix of every single combination instantly in memory
    similarity_matrix = util.cos_sim(market_embeddings, user_embeddings)

    matched = []
    missing = []
    additional = []
    
    # Initialize domains tracking math
    domains_math = {}
    for ms in market_skills:
        if ms.domain not in domains_math:
            # Core domains get heavy weight, others (Bonus, AI/ML, Cloud) default to 1.0
            weight_multiplier = 2.0 if ms.domain.lower() == 'core' else 1.0
            domains_math[ms.domain] = {"total_weight": 0.0, "matched_weight": 0.0, "multiplier": weight_multiplier}
        domains_math[ms.domain]["total_weight"] += domains_math[ms.domain]["multiplier"]

    # Process Market Skill Matches & Gaps
    for idx, ms in enumerate(market_skills):
        # Get the row of scores for this specific market skill against all user skills
        ms_scores = similarity_matrix[idx]
        best_score = float(max(ms_scores)) if cleaned_user_skills[0] != "" else 0.0
        
        if best_score >= 0.75:
            matched.append({
                "market_skill": ms.name,
                "domain": ms.domain,
                "score": round(best_score, 4)
            })
            domains_math[ms.domain]["matched_weight"] += domains_math[ms.domain]["multiplier"]
        else:
            missing.append({
                "market_skill": ms.name,
                "domain": ms.domain,
                "best_score": round(best_score, 4)
            })

    # Process Additional Skills (User skills that didn't clear the 0.75 bar against any market demands)
    # Transpose matrix perspective to [U x M] by reading columns
    if cleaned_user_skills != [""]:
        for idx, user_skill in enumerate(cleaned_user_skills):
            user_scores = similarity_matrix[:, idx] # Slice column out of matrix
            best_user_score = float(max(user_scores))
            if best_user_score < 0.75:
                additional.append(user_skill)

    # Compress domains_math for Frontend Chart.js layout compatibility
    domains_output = {
        dom: {
            "total_weight": data["total_weight"],
            "matched_weight": data["matched_weight"]
        }
        for dom, data in domains_math.items()
    }

    return {
        "matched": matched,
        "missing": missing,
        "additional": additional,
        "domains": domains_output
    }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=50505)

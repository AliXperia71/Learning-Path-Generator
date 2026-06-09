from fastapi import APIRouter
from models.schemas import LearningPathRequest
from services.llm_client import generate_learning_path

router = APIRouter()

@router.post("/generate")
def generate_path(request: LearningPathRequest):
    result = generate_learning_path(
        goal=request.goal,
        experience_level=request.experience_level,
        hours_per_week=request.hours_per_week
    )
    return result

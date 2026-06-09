from fastapi import APIRouter
from models.schemas import QuizRequest, QuizSubmission
from services.llm_client import generate_quiz, grade_quiz

router = APIRouter()

@router.post("/quiz/generate")
def get_quiz(request: QuizRequest):
    result = generate_quiz(
        milestone=request.milestone,
        week_number=request.week_number
    )
    return result

@router.post("/quiz/submit")
def submit_quiz(submission: QuizSubmission):
    result = grade_quiz(
        milestone=submission.milestone,
        week_number=submission.week_number,
        questions=[q.dict() for q in submission.questions],
        answers=[a.dict() for a in submission.answers]
    )
    return result

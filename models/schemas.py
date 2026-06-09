from pydantic import BaseModel, Field
from typing import Literal

class LearningPathRequest(BaseModel):
    goal: str = Field(min_length=3)
    experience_level: Literal["beginner", "intermediate", "advanced"]
    hours_per_week: int = Field(ge=1, le=40)

class QuizRequest(BaseModel):
    milestone: str
    week_number: int = Field(ge=1, le=12)

class QuizQuestion(BaseModel):
    question_number: int
    type: str
    question: str
    options: list[str] | None = None

class QuizResponse(BaseModel):
    week_number: int
    milestone: str
    questions: list[QuizQuestion]

class QuizAnswer(BaseModel):
    question_number: int
    answer: str

class QuizSubmission(BaseModel):
    week_number: int
    milestone: str
    questions: list[QuizQuestion]
    answers: list[QuizAnswer]





import json
import os
import requests
from sqlalchemy import text

from services.ai_service import azure_chat_json
from services.database import get_db, quiz_attempts

# Azure OpenAI generates quizzes; a small local Ollama model is only the fallback
# when Azure fails. It was the other way round until 2026-09-18, which loaded the
# 6.6 GB qwen3.5:9b on every local quiz and nearly froze a MacBook. 2b is small
# enough to run alongside everything else. On the Veriton, OLLAMA_HOST is unset,
# so it points at localhost *inside the api container* where nothing listens:
# production is effectively Azure-only on purpose. A CPU-only model on that box
# could outlast Cloudflare's 100s edge timeout.
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
QUIZ_MODEL = os.getenv("QUIZ_MODEL", "qwen3.5:2b")
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))
# qwen3.5 advertises a 262K context and Ollama sizes its memory for the whole
# window: the 2.7 GB model loaded at 5.9 GB. 16K covers the biggest request,
# grading five answers of up to 5,000 chars each, and stays near the file size.
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "16384"))
# Fallback use is rare, so free the memory soon after instead of Ollama's 5 min
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "1m")

PASS_THRESHOLD = 0.6  # fraction of total points needed to pass


# JSON Schemas for Ollama structured outputs. Ollama constrains decoding to the
# schema, so the model *cannot* return the wrong number or shape of questions.
# Plain "json" mode left qwen3.5:2b at 2/5 valid quizzes (it returned 3, 4 or 6
# questions). Azure follows the prompt reliably and doesn't need them.
_MCQ = {
    "type": "object",
    "properties": {
        "question_number": {"type": "integer"},
        "type": {"type": "string", "enum": ["multiple_choice"]},
        "question": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
        # An index, not the text: asked for the text, qwen3.5:2b wrote an answer
        # key matching none of its own options in ~half of questions, which made
        # them impossible to get right. generate_quiz maps it back to the text.
        "correct_option": {"type": "integer", "enum": [0, 1, 2, 3]},
    },
    "required": ["question_number", "type", "question", "options", "correct_option"],
}
_OPEN = {
    "type": "object",
    "properties": {
        "question_number": {"type": "integer"},
        "type": {"type": "string", "enum": ["open_ended"]},
        "question": {"type": "string"},
    },
    "required": ["question_number", "type", "question"],
}
QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "prefixItems": [_MCQ, _MCQ, _MCQ, _OPEN, _OPEN],
            "minItems": 5,
            "maxItems": 5,
        }
    },
    "required": ["questions"],
}


def _feedback_schema(count: int) -> dict:
    return {
        "type": "object",
        "properties": {
            "feedback": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question_number": {"type": "integer"},
                        "correct": {"type": "boolean"},
                        "explanation": {"type": "string"},
                    },
                    "required": ["question_number", "correct", "explanation"],
                },
                "minItems": count,
                "maxItems": count,
            }
        },
        "required": ["feedback"],
    }


def _call_ollama(system_prompt: str, user_prompt: str, schema: dict | None = None) -> dict:
    response = requests.post(
        f"{OLLAMA_HOST}/api/chat",
        json={
            "model": QUIZ_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "format": schema or "json",
            "stream": False,
            # qwen3.5 is a thinking model; hidden reasoning tokens would add
            # latency with no benefit to a JSON quiz
            "think": False,
            "options": {"num_ctx": OLLAMA_NUM_CTX},
            "keep_alive": OLLAMA_KEEP_ALIVE,
        },
        timeout=OLLAMA_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return json.loads(response.json()["message"]["content"])


def _call_azure(system_prompt: str, user_prompt: str) -> dict:
    return azure_chat_json([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ])


def _call_llm(system_prompt: str, user_prompt: str, schema: dict | None = None) -> dict:
    """Routes to Azure OpenAI first, falls back to Ollama (held to `schema` when
    given). Raises RuntimeError if both fail."""
    try:
        return _call_azure(system_prompt, user_prompt)
    except Exception as azure_err:
        print(f"⚠️ Azure OpenAI failed, falling back to Ollama ({QUIZ_MODEL}): {type(azure_err).__name__}")
        try:
            return _call_ollama(system_prompt, user_prompt, schema)
        except Exception as ollama_err:
            raise RuntimeError(
                f"Both quiz models failed. Azure: {type(azure_err).__name__} | Ollama: {ollama_err}"
            )


def generate_quiz(user_id: int, milestone: str, week_number: int, group_id: int | None = None) -> dict:
    """
    Generates 3 multiple-choice + 2 open-ended questions for a weekly milestone,
    persists them (answers included) as a quiz_attempts row, and returns the
    questions with correct answers stripped out so they never reach the client.
    """
    system_prompt = (
        "You are a quiz author for a technical learning platform. "
        "Respond ONLY with a valid JSON object, no markdown fences, matching exactly:\n"
        "{\n"
        '  "questions": [\n'
        '    {"question_number": 1, "type": "multiple_choice", "question": "...", '
        '"options": ["...", "...", "...", "..."], "correct_answer": "..."},\n'
        '    {"question_number": 4, "type": "open_ended", "question": "..."}\n'
        "  ]\n"
        "}\n"
        "Rules: exactly 5 questions — questions 1-3 are type multiple_choice with exactly 4 options "
        "each and a correct_answer that is copied verbatim from the options; questions 4-5 are type "
        "open_ended with no options field. Questions must test practical understanding, not trivia."
    )
    user_prompt = (
        f"Write a quiz for week {week_number} of a learning path. "
        f"The milestone being tested is: '{milestone}'."
    )

    data = _call_llm(system_prompt, user_prompt, QUIZ_SCHEMA)
    questions = data.get("questions", [])
    if len(questions) != 5:
        raise RuntimeError(f"Model returned {len(questions)} questions instead of 5.")

    # Normalize numbering so the frontend's answer map lines up regardless of model quirks
    for i, q in enumerate(questions, start=1):
        q["question_number"] = i
        # The Ollama fallback returns the answer as an index into options
        idx = q.pop("correct_option", None)
        if q.get("type") == "multiple_choice" and isinstance(idx, int) and 0 <= idx < len(q.get("options", [])):
            q["correct_answer"] = q["options"][idx]

    # Stripping and persist
    quiz_id = create_attempt(user_id, milestone, week_number, group_id, questions)
    public = [{k: v for k, v in q.items() if k != "correct_answer"} for q in questions]
    return {"quiz_id": quiz_id, "week_number": week_number, "milestone": milestone, "questions": public}


def grade_quiz(user_id: int, quiz_id: int, answers: list[dict]) -> dict:
    """
    Grades a stored quiz attempt. Loads the questions (with answers) the server
    saved at generation time — the client never supplies them — then grades MCQs
    deterministically and open-ended answers via the LLM. Locks the attempt after
    the first successful grade so scores can't be re-fished.
    """
    attempt = get_attempt(user_id, quiz_id)
    if attempt is None:
        raise ValueError("Quiz not found.")
    if attempt["status"] == "graded":
        raise ValueError("This quiz has already been submitted.")

    milestone = attempt["milestone"]
    week_number = attempt["week_number"]
    questions = json.loads(attempt["questions_json"])

    answer_map = {a["question_number"]: a.get("answer", "") for a in answers}
    feedback: list[dict] = []
    open_ended: list[dict] = []
    score = 0

    for q in questions:
        num = q.get("question_number")
        given = str(answer_map.get(num, "")).strip()

        if q.get("type") == "multiple_choice":
            correct_answer = str(q.get("correct_answer", "")).strip()
            is_correct = given.lower() == correct_answer.lower()
            score += 1 if is_correct else 0
            feedback.append({
                "question_number": num,
                "correct": is_correct,
                "explanation": (
                    f"Correct — '{correct_answer}' is the right answer."
                    if is_correct
                    else f"Not quite. The correct answer is '{correct_answer}'."
                ),
            })
        else:
            open_ended.append({"question_number": num, "question": q.get("question", ""), "answer": given})

    graded_open = _grade_open_ended(milestone, open_ended) if open_ended else []
    for item in graded_open:
        score += 1 if item.get("correct") else 0
        feedback.append(item)

    feedback.sort(key=lambda f: f["question_number"])
    total = len(questions)
    passed = total > 0 and (score / total) >= PASS_THRESHOLD

    # Persist the score and lock the attempt only after grading fully succeeds —
    # if the open-ended LLM call raised above, the attempt stays 'pending' and retryable.
    _mark_graded(quiz_id, score, total)

    return {
        "quiz_id": quiz_id,
        "week_number": week_number,
        "score": score,
        "total": total,
        "passed": passed,
        "feedback": feedback,
        "overall_feedback": _overall_feedback(score, total, passed),
    }


def _grade_open_ended(milestone: str, submissions: list[dict]) -> list[dict]:
    system_prompt = (
        "You are a fair, encouraging grader for a technical learning platform. "
        "Respond ONLY with a valid JSON object, no markdown fences, matching exactly:\n"
        '{"feedback": [{"question_number": 4, "correct": true, "explanation": "..."}]}\n'
        "Rules: mark an answer correct if it demonstrates genuine understanding of the concept, even "
        "if imperfectly worded. Mark it incorrect if it is blank, off-topic, or fundamentally wrong. "
        "Each explanation is 1-3 sentences telling the learner what was right or what to review."
    )
    user_prompt = (
        f"The milestone being tested is: '{milestone}'. Grade these open-ended answers:\n"
        f"{json.dumps(submissions, indent=2)}"
    )

    data = _call_llm(system_prompt, user_prompt, _feedback_schema(len(submissions)))
    graded = data.get("feedback", [])

    # If the model dropped a question, count it as ungraded-but-wrong rather than crashing
    graded_nums = {g.get("question_number") for g in graded}
    for sub in submissions:
        if sub["question_number"] not in graded_nums:
            graded.append({
                "question_number": sub["question_number"],
                "correct": False,
                "explanation": "This answer could not be graded automatically — review the topic and retry.",
            })
    return graded


def _overall_feedback(score: int, total: int, passed: bool) -> str:
    if total == 0:
        return "No questions were submitted for grading."
    ratio = score / total
    if ratio == 1:
        return "Perfect score — you've clearly mastered this milestone. On to the next week!"
    if passed:
        return "Solid work — you passed this milestone. Review the missed questions before moving on."
    return "You haven't quite got this milestone yet. Revisit this week's resources and try again."


def create_attempt(user_id, milestone, week_number, group_id, questions) -> int:
    """Stores a freshly generated quiz (answers included) and returns its id."""
    with get_db() as conn:
        result = conn.execute(
            quiz_attempts.insert().values(
                user_id=user_id,
                group_id=group_id,
                milestone=milestone,
                week_number=week_number,
                questions_json=json.dumps(questions),
            )
        )
        return result.inserted_primary_key[0]


def get_attempt(user_id, quiz_id) -> dict | None:
    """Loads an attempt scoped to its owner — user_id in the WHERE clause blocks
    reading anyone else's quiz. Returns None if it doesn't exist or isn't theirs."""
    with get_db() as conn:
        row = conn.execute(
            text("SELECT * FROM quiz_attempts WHERE id = :id AND user_id = :user_id"),
            {"id": quiz_id, "user_id": user_id},
        ).mappings().first()
    return dict(row) if row else None


def _mark_graded(quiz_id, score, total) -> None:
    with get_db() as conn:
        conn.execute(
            text("UPDATE quiz_attempts SET score = :score, total = :total, status = 'graded' WHERE id = :id"),
            {"score": score, "total": total, "id": quiz_id},
        )
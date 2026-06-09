import json
import logging
import os
import re
import time
import ollama
from dotenv import load_dotenv
from services import cache

load_dotenv()

logger = logging.getLogger(__name__)

PRIMARY_MODEL = os.getenv("PRIMARY_MODEL", "qwen3.5:9b")
SECONDARY_MODEL = os.getenv("SECONDARY_MODEL", "deepseek-r1:8b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

MAX_RETRIES = 3
BASE_DELAY = 2  # seconds

_client = ollama.Client(host=OLLAMA_HOST)


class LLMError(Exception):
    """Raised when the LLM is unreachable or fails after all retries."""


def _call_llm(prompt: str, model: str) -> str:
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = _client.generate(model=model, prompt=prompt)
            raw = response["response"].strip()
            # deepseek-r1 wraps reasoning in <think> blocks before the actual output
            return re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        except ollama.ResponseError as e:
            if e.status_code == 404:
                logger.error("Model '%s' not found on Ollama host %s", model, OLLAMA_HOST)
                raise LLMError(f"Model '{model}' not found. Run: ollama pull {model}") from e
            last_err = e
        except ConnectionError as e:
            last_err = e
        if attempt < MAX_RETRIES:
            logger.warning("LLM call retry %s/%s for %s: %s", attempt, MAX_RETRIES, model, last_err)
            time.sleep(BASE_DELAY * attempt)
    raise LLMError(f"LLM call failed after {MAX_RETRIES} attempts: {last_err}")


def _parse_json(raw: str) -> dict:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def _call_and_parse(prompt: str, model: str) -> dict:
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return _parse_json(_call_llm(prompt, model))
        except json.JSONDecodeError as e:
            last_err = e
        if attempt < MAX_RETRIES:
            logger.warning("Invalid JSON from %s, retry %s/%s: %s", model, attempt, MAX_RETRIES, last_err)
            time.sleep(BASE_DELAY * attempt)
    raise LLMError(f"LLM returned invalid JSON after {MAX_RETRIES} attempts: {last_err}")


def _near_threshold(score: int, total: int) -> bool:
    if total == 0:
        return False
    return 55 <= (score / total) * 100 <= 65


def generate_learning_path(goal: str, experience_level: str, hours_per_week: int) -> dict:
    cache_key = cache.make_key(
        "path", goal=goal.lower().strip(), experience_level=experience_level, hours_per_week=hours_per_week
    )
    if (cached := cache.get(cache_key)) is not None:
        return cached

    prompt = f"""
    You are a learning path expert.

    Create a step-by-step learning roadmap for someone who wants to: {goal}
    Their experience level is: {experience_level}
    They have {hours_per_week} hours per week to dedicate.

    Respond ONLY with a valid JSON object. No markdown, no explanation, no backticks.
    Use exactly this structure:

    {{
      "goal": "{goal}",
      "experience_level": "{experience_level}",
      "hours_per_week": {hours_per_week},
      "total_weeks": 12,
      "weeks": [
        {{
          "week": 1,
          "milestone": "short description of the goal for this week",
          "resources": ["resource 1", "resource 2"],
          "checkpoint": "how to assess progress this week"
        }}
      ]
    }}
    """
    result = _call_and_parse(prompt, PRIMARY_MODEL)
    cache.set(cache_key, result)
    return result


def generate_quiz(milestone: str, week_number: int) -> dict:
    cache_key = cache.make_key("quiz", milestone=milestone.lower().strip(), week_number=week_number)
    if (cached := cache.get(cache_key)) is not None:
        return cached

    prompt = f"""
    You are a quiz generator for a learning platform.

    Generate a quiz for someone who just completed this weekly milestone:
    Week {week_number}: {milestone}

    Respond ONLY with a valid JSON object. No markdown, no explanation, no backticks.
    Use exactly this structure:

    {{
      "week_number": {week_number},
      "milestone": "{milestone}",
      "questions": [
        {{
          "question_number": 1,
          "type": "multiple_choice",
          "question": "question text here",
          "options": ["A. option1", "B. option2", "C. option3", "D. option4"]
        }},
        {{
          "question_number": 2,
          "type": "multiple_choice",
          "question": "question text here",
          "options": ["A. option1", "B. option2", "C. option3", "D. option4"]
        }},
        {{
          "question_number": 3,
          "type": "multiple_choice",
          "question": "question text here",
          "options": ["A. option1", "B. option2", "C. option3", "D. option4"]
        }},
        {{
          "question_number": 4,
          "type": "free_response",
          "question": "question text here",
          "options": null
        }},
        {{
          "question_number": 5,
          "type": "free_response",
          "question": "question text here",
          "options": null
        }}
      ]
    }}
    """
    result = _call_and_parse(prompt, PRIMARY_MODEL)
    cache.set(cache_key, result)
    return result


def grade_quiz(milestone: str, week_number: int, questions: list, answers: list) -> dict:
    qa_block = ""
    for q in questions:
        answer = next((a["answer"] for a in answers if a["question_number"] == q["question_number"]), "No answer")
        options = "\n".join(q["options"]) if q.get("options") else "Open ended"
        qa_block += f"""
        Question {q["question_number"]} ({q["type"]}): {q["question"]}
        Options: {options}
        User's Answer: {answer}
        ---"""

    prompt = f"""
    You are grading a quiz for someone learning {milestone} (Week {week_number}).

    Here are their answers:
    {qa_block}

    Grade each answer and respond ONLY with a valid JSON object. No markdown, no explanation, no backticks.
    Use exactly this structure:

    {{
      "week_number": {week_number},
      "score": 4,
      "total": 5,
      "passed": true,
      "feedback": [
        {{
          "question_number": 1,
          "correct": true,
          "explanation": "brief explanation"
        }}
      ],
      "overall_feedback": "one sentence summary of performance"
    }}

    For multiple choice: mark correct only if they selected the right option.
    For open ended: use your judgment, partial credit is fine, reflect that in the score.
    Pass threshold is 60%.
    """

    result = _call_and_parse(prompt, PRIMARY_MODEL)

    # Near pass/fail threshold — re-grade with the stronger reasoning model
    if _near_threshold(result.get("score", 0), result.get("total", 5)):
        logger.info(
            "Week %s score %s/%s near threshold — re-grading with %s",
            week_number, result.get("score", 0), result.get("total", 5), SECONDARY_MODEL,
        )
        result = _call_and_parse(prompt, SECONDARY_MODEL)

    return result

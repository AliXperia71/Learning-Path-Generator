import hashlib
import json
import logging
import os
import redis
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", str(24 * 60 * 60)))

_redis = redis.Redis.from_url(REDIS_URL, decode_responses=True)


def make_key(prefix: str, **parts) -> str:
    blob = json.dumps(parts, sort_keys=True)
    return f"{prefix}:{hashlib.sha256(blob.encode()).hexdigest()}"


def get(key: str) -> dict | None:
    # Cache failures must never break the request — fall through to the LLM
    try:
        cached = _redis.get(key)
    except redis.RedisError as e:
        logger.warning("Cache read failed, falling back to LLM: %s", e)
        return None
    if cached is None:
        return None
    logger.info("Cache hit: %s", key)
    return json.loads(cached)


def set(key: str, value: dict) -> None:
    try:
        _redis.set(key, json.dumps(value), ex=CACHE_TTL_SECONDS)
    except redis.RedisError as e:
        logger.warning("Cache write failed: %s", e)

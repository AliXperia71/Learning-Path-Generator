from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from routes.generate import router as generate_router
from routes.quiz import router as quiz_router
from services.llm_client import LLMError
import logging

app = FastAPI(title="Learning Path Generator")

logging.basicConfig(
    level = logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

@app.exception_handler(LLMError)
def llm_error_handler(request: Request, exc: LLMError):
    logger.error("LLM failure on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=503, content={"detail": str(exc)})

app.include_router(generate_router)
app.include_router(quiz_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}

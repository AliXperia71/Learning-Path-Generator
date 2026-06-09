# Learning-Path-Generator

🧭 Learning Path Generator — Backend
An AI-powered backend that generates personalized, structured learning roadmaps based on your goal, experience level, and available time. Built with FastAPI and local LLMs via Ollama.

> **For end users:** You just use the app — no setup needed on your end.
> **For developers/team members:** The instructions below are for running the backend and LLMs on your development machine or a server. End users never interact with Ollama directly.

🚀 What It Does

Takes a learning goal, experience level, and weekly hours as input
Uses local LLMs (Ollama) to generate a 12-week structured learning path
Returns clean, structured JSON with weekly milestones, resources, and checkpoints
Generates milestone quizzes with multiple choice and open-ended questions
Grades quiz submissions with per-question feedback and an overall score


🛠️ Tech Stack

Python 3.11+
FastAPI — web framework
Ollama — local LLM runtime (primary: qwen3.5:9b, secondary: deepseek-r1:8b)
Redis — caching for repeated generation requests
Uvicorn — ASGI server
Pydantic — data validation
python-dotenv — environment variable management


📁 Project Structure
learning-path-generator/
├── main.py               # App entry point
├── .env                  # Local config (create this yourself — see below)
├── .gitignore
├── models/
│   └── schemas.py        # Pydantic data models
├── routes/
│   ├── generate.py       # /generate endpoint
│   └── quiz.py           # /quiz endpoints
└── services/
    ├── llm_client.py     # Ollama AI logic (model routing + prompts)
    └── cache.py          # Redis caching layer

⚙️ Setup Instructions
1. Clone the Repository
git clone https://github.com/pratyushPtr/Learning-Path-Backend.git
cd Learning-Path-Backend

2. Install Ollama (on the machine running the backend)
Download and install Ollama from https://ollama.com
Then pull the required models:
ollama pull qwen3.5:9b
ollama pull deepseek-r1:8b

Note: Ollama runs on the server or developer machine — not on the end user's device.
qwen3.5:9b requires ~6GB RAM and deepseek-r1:8b requires ~5GB RAM. A machine with 16GB RAM is recommended to run both comfortably.

3. Create a Virtual Environment (Recommended)
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

4. Install Dependencies
pip install fastapi uvicorn ollama python-dotenv redis

5. Install and Start Redis (on the machine running the backend)
brew install redis          # Mac
brew services run redis     # starts Redis for this session only

Note: use "run", not "start" — "brew services start redis" registers Redis to
launch at every boot (it shows up in macOS Background Activity 24/7).
"run" starts it only until you stop it or reboot. Start it whenever you develop:
brew services run redis
brew services stop redis    # when done (optional — it also dies on reboot)

Verify it's running:
redis-cli ping              # should reply PONG

Redis is optional for development: if it's not running, the app still works —
requests just skip the cache and hit the LLM directly (you'll see a one-line
warning in the logs per request).

6. Create Your .env File
In the project root, create a file named .env (no extension).

For local development (Ollama running on the same machine):
OLLAMA_HOST=http://localhost:11434

For a remote server or cloud deployment (e.g. an Azure VM running Ollama):
OLLAMA_HOST=http://<your-server-ip>:11434

You can also override the default models if needed:
PRIMARY_MODEL=qwen3.5:9b
SECONDARY_MODEL=deepseek-r1:8b

Optional cache settings (defaults shown):
REDIS_URL=redis://localhost:6379/0
CACHE_TTL_SECONDS=86400

⚠️ Never commit your .env file. It is already in .gitignore.

7. Start Ollama
Make sure the Ollama service is running before starting the server:
ollama serve

8. Run the Server
uvicorn main:app --reload
The server will start at http://127.0.0.1:8000

📖 API Endpoints
Once running, open Swagger UI at:
http://127.0.0.1:8000/docs

GET /health
Check if the server is running.
Response:
json{ "status": "ok" }

POST /generate
Generate a personalized 12-week learning path.
Request Body:
json{
  "goal": "Learn Python",
  "experience_level": "beginner",
  "hours_per_week": 5
}
Response:
json{
  "goal": "Learn Python",
  "experience_level": "beginner",
  "hours_per_week": 5,
  "total_weeks": 12,
  "weeks": [
    {
      "week": 1,
      "milestone": "...",
      "resources": ["...", "..."],
      "checkpoint": "..."
    }
  ]
}

POST /quiz/generate
Generate a quiz for a specific week's milestone.
Request Body:
json{
  "milestone": "Understanding Python Variables and Data Types",
  "week_number": 1
}
Response: Returns 3 multiple choice + 2 open-ended questions.

POST /quiz/submit
Submit quiz answers and receive graded feedback.
Request Body: Pass the original questions back along with answers:
json{
  "week_number": 1,
  "milestone": "Understanding Python Variables and Data Types",
  "questions": [...],
  "answers": [
    { "question_number": 1, "answer": "A" },
    { "question_number": 2, "answer": "B" },
    { "question_number": 4, "answer": "A variable stores data that can change." }
  ]
}
Response:
json{
  "week_number": 1,
  "score": 4,
  "total": 5,
  "passed": true,
  "feedback": [...],
  "overall_feedback": "Great understanding of the basics!"
}

🧠 Model Routing
The backend uses two local models with automatic routing:

qwen3.5:9b (primary) — handles all learning path generation, quiz generation, and grading
deepseek-r1:8b (secondary) — automatically used to re-grade when a score lands near the 60% pass/fail threshold (55–65%), where precision matters most

Both models run on the backend server via Ollama — end users never run or interact with them directly.

🧪 Testing the API
The easiest way is through Swagger UI at http://127.0.0.1:8000/docs:

Click an endpoint
Click "Try it out"
Fill in the request body
Click "Execute"


👥 Team
RoleResponsibilityAI EngineerLLM integration, FastAPI backend, prompt engineeringAI Project ManagerProject planning, timeline, coordinationAI AnalystResearch, output evaluation, improvementAI Data EngineerDatabase, progress tracking, data persistenceEthical AI AnalystBias review, responsible AI practices

📌 Notes for Team Members

No API key needed — all AI runs on the backend server via Ollama (not on the end user's device)
Make sure ollama serve is running on the server before starting the FastAPI server
Both models must be pulled on the server before first use: ollama pull qwen3.5:9b && ollama pull deepseek-r1:8b
Use --reload flag during development so the server auto-restarts on file changes
All AI logic lives in services/llm_client.py — that's the core file
Model names can be overridden via .env (PRIMARY_MODEL, SECONDARY_MODEL) without touching code

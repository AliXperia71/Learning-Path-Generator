# Course Forge — AI-Powered Learning Path Generator

🧭 Full-stack web application that generates personalized, structured learning roadmaps for any topic. Built with **FastAPI** (backend), **React + Vite** (frontend), **Azure OpenAI** (pathway generation), and **Ollama** (quiz generation).

> **For end users:** Use the web interface at `http://localhost:5173` — create an account (or sign in) and start generating paths.  
> **For developers:** Instructions below cover running both backend and frontend locally.

---

## 🚀 What It Does

- **Generate personalized learning paths:** Takes a topic, experience level, and daily time commitment as input
- **Dynamic timeline calculation:** AI calculates optimal learning duration based on complexity and available time
- **Live resources:** Automatically fetches curated resources (videos, articles, tutorials) for each week
- **Weekly milestones:** Structured curriculum with focus areas, practice tasks, and mini-exercises
- **Quiz generation & grading:** Weekly milestone quizzes (3 multiple-choice + 2 open-ended) with AI-powered per-question feedback
- **User accounts:** Register/login with secure sessions — passwords stored only as bcrypt hashes, never plaintext
- **Sign in with a username or an email:** one field accepts either, so nobody gets locked out for forgetting which they used
- **Google Sign-In (optional):** one-click sign-in that links to an existing account with the same verified email. Hidden entirely unless a Google client ID is configured
- **Account recovery:** "Forgot username or password?" emails a username reminder and a 30-minute, single-use reset link
- **Profile settings:** click your username in the navbar to change your username, email, or password, and write an "About me" bio
- **Study groups:** create or join by invite code, log weekly hours, and compete on a per-group leaderboard
- **Responsive UI:** Clean, modern interface with light/dark mode, a login gate, roadmap view, and quiz flow

---

## 🛠️ Tech Stack

### Backend
- **Python 3.11+** with FastAPI
- **Azure OpenAI** — generates personalized learning paths; automatic fallback for quizzes
- **Ollama (qwen3.5:9b)** — generates and grades milestone quizzes (primary quiz model)
- **SQLAlchemy Core** — one `DATABASE_URL` runs SQLite locally or Azure SQL in production
- **SQLite + bcrypt + PyJWT** — user accounts, password hashing, and token-based sessions
- **google-auth** *(optional)* — verifies Google Sign-In ID tokens
- **smtplib** (stdlib) — password-reset and username-reminder emails; prints to the console when SMTP isn't configured
- **slowapi** — per-IP rate limiting on auth, per-user on AI endpoints
- **Uvicorn** — ASGI server
- **Pydantic** — data validation
- **CORS middleware** — enables frontend communication

### Frontend
- **React 19** with Vite
- **Tailwind CSS v4** — semantic color tokens driving light/dark mode
- **Lucide React** — icons
- **Google Identity Services** — the Sign in with Google button, loaded from Google's CDN (no npm dependency)
- **Vite** — fast build tooling
- **Firebase** — deployment-ready

---

## 📁 Project Structure

```
Course_Forge/
├── compose.yaml                 # Runs both containers together (see Deployment)
├── .env.example                 # Compose build args only — app config is backend/.env
├── ops/
│   ├── deploy.sh                # Gated deploy: backup → pull → rebuild → health → auto-rollback
│   └── backup-db.sh             # Nightly snapshot of the DB out of the cf-data volume
├── backend/
│   ├── main.py                 # FastAPI entry point, CORS config, DB init
│   ├── requirements.txt         # Python dependencies
│   ├── .env                     # Local config (create this yourself)
│   │                            # (SQLite DB lives at ~/.course_forge/courseforge.db —
│   │                            #  outside the repo, so re-cloning never wipes accounts)
│   ├── models/
│   │   └── schemas.py           # Pydantic request/response models (paths, auth, quizzes)
│   ├── routes/
│   │   ├── learning_path.py     # /api/generate endpoint
│   │   ├── auth.py              # register/login/google, forgot+reset, GET+PATCH /me, change-password
│   │   ├── paths.py             # Saved-path list/fetch/delete
│   │   ├── quiz.py              # /api/quiz/generate, /api/quiz/submit
│   │   ├── resume.py            # /api/resume/analyze (ATS scan + job matching)
│   │   ├── groups.py            # Study groups: create/join, hours, leaderboard
│   │   └── health.py            # /api/health/db readiness probe
│   └── services/
│       ├── ai_service.py        # Azure OpenAI integration
│       ├── resource_service.py  # Resource fetching + YouTube caching
│       ├── quiz_service.py      # Quiz gen/grading (Ollama primary, Azure fallback)
│       ├── group_service.py     # Group membership, progress, leaderboard
│       ├── auth_service.py      # bcrypt + JWT, username/email login, reset tokens, Google
│       ├── email_service.py     # SMTP send with console fallback (stdlib, no dependency)
│       ├── rate_limit.py        # slowapi limiter + per-IP / per-user keying
│       └── database.py          # Schema, engine, and auto-migration
│
└── frontend/
    ├── index.html
    ├── nginx.conf               # SPA fallback + /api proxy for the Docker image
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   └── landing/             # Marketing page, served as-is and shown in an iframe
    │       └── README.md        #   how it got here and how to re-sync it
    └── src/
        ├── App.jsx              # Main React component (auth gate, navbar, view routing)
        ├── index.css            # Tailwind v4 + semantic light/dark color tokens
        ├── components/
        │   ├── GroupSkills.jsx        # Study groups view
        │   ├── ProfileSettings.jsx    # Account / password / connected accounts
        │   ├── GoogleSignInButton.jsx # Google Identity Services button (CDN, no npm dep)
        │   ├── LandingModal.jsx       # "About Course Forge" full-screen pop-up
        │   ├── CareerReport.jsx       # Resume ATS results + job links
        │   └── LoadingScreen.jsx      # Animated loading
        └── assets/              # Images and icons
```

---

## ⚙️ Setup Instructions

### Prerequisites
- **Python 3.11+** on your machine
- **Node.js 18+** for frontend
- **Azure OpenAI API credentials** (for pathway generation)
- **YouTube Data API v3 key** (for live video resources in paths) — *each teammate creates their own free key; see [Getting your own YouTube API key](#-getting-your-own-youtube-api-key-required--one-per-teammate)*
- **Ollama** (for quiz generation) — *optional; quizzes automatically fall back to Azure OpenAI when Ollama isn't running*

---

### Backend Setup

#### 1. Navigate to the backend directory
```bash
cd Course_Forge/backend
```

#### 2. Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows
```

#### 3. Install dependencies
```bash
pip install -r requirements.txt
```

#### 4. Create a `.env` file
In the `backend/` directory, copy the provided template and fill in your values:
```bash
cp .env.example .env
```
Each variable is documented inline in `.env.example`. For reference, the full set:

```env
# ============================================================================
# REQUIRED: Azure OpenAI (for generating learning paths)
# Get these from your Azure portal: https://portal.azure.com
# - AZURE_OPENAI_API_KEY: Your Azure OpenAI resource's API key
# - AZURE_OPENAI_ENDPOINT: Your resource URL (e.g., https://my-resource.openai.azure.com/)
# - AZURE_OPENAI_DEPLOYMENT_NAME: The name of your deployed model (e.g., "gpt-4")
# ============================================================================
AZURE_OPENAI_API_KEY=your-azure-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-05-01-preview

# ============================================================================
# REQUIRED: YouTube Data API v3 key (live video resources in learning paths)
# Each teammate creates their OWN key — see "Getting your own YouTube API key"
# below. Without it, paths generate but every week is missing its videos.
# ============================================================================
YOUTUBE_API_KEY=your-youtube-api-key

# ============================================================================
# REQUIRED: Frontend CORS origins (which URLs can call the backend)
# Keep both for local dev; add your production domain when you deploy
# ============================================================================
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# ============================================================================
# REQUIRED: JWT signing secret (for login sessions)
# Generate a random secret by running this once in your terminal:
#   python -c "import secrets; print(secrets.token_hex(32))"
# Then paste the output below. This keeps your login tokens secure.
# If you skip this, sessions will expire every time the server restarts.
# ============================================================================
JWT_SECRET=your-random-secret-here

# ============================================================================
# OPTIONAL: Ollama configuration (for free, fast quiz generation locally)
# - If Ollama is NOT running, quizzes will automatically use Azure OpenAI instead
# - Only set these if you have Ollama installed and running (`ollama serve`)
# - To check if Ollama is working: curl http://localhost:11434/api/tags
# ============================================================================
OLLAMA_HOST=http://localhost:11434
QUIZ_MODEL=qwen3.5:9b

# ============================================================================
# OPTIONAL: Google Sign-In
# Leave unset and the "Sign in with Google" button simply doesn't render —
# username/email sign-in works either way.
# Create an OAuth 2.0 *Web application* client at https://console.cloud.google.com
# (APIs & Services -> Credentials), add http://localhost:5173 as an authorized
# JavaScript origin, then paste the Client ID here AND in frontend/.env as
# VITE_GOOGLE_CLIENT_ID. Only the Client ID is needed — no client secret.
# ============================================================================
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com

# ============================================================================
# OPTIONAL: Outgoing email (password reset + username reminder)
# Leave unset and reset links PRINT TO THE BACKEND CONSOLE instead of sending,
# which is enough to test the whole flow locally.
# For Gmail, SMTP_PASS must be an App Password (not your account password):
# https://myaccount.google.com/apppasswords — requires 2-Step Verification.
# ============================================================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=Course Forge <you@gmail.com>

# Base URL the emailed reset link points at (your frontend, not the API)
FRONTEND_URL=http://localhost:5173
```

**⚠️ Never commit `.env`. It's already in `.gitignore`.**

**Didn't get the reset email?** That's expected until `SMTP_HOST` is set — the message is printed to
the terminal running `uvicorn` instead. Look for a `📧 EMAIL (not sent …)` block and copy the
`http://localhost:5173/?reset=…` link out of it. The UI always shows the same confirmation either
way, on purpose: the endpoint never reveals whether an address is registered.

**Quick setup if you don't have Azure yet:**
If you don't have Azure OpenAI credentials yet, you can still test the login and UI locally — just skip `AZURE_OPENAI_*` for now and you'll get a 503 error only when you try to generate a path. Add the credentials later when you're ready to test the full flow.

#### 5. Start the backend server
```bash
uvicorn main:app --reload
```

The backend will start at `http://127.0.0.1:8000`  
Swagger docs available at `http://127.0.0.1:8000/docs`

---

### Frontend Setup

#### 1. Navigate to the frontend directory
```bash
cd Course_Forge/frontend
```

#### 2. Install dependencies
```bash
npm install
```

#### 3. Start the dev server
```bash
npm run dev
```

The frontend will start at `http://localhost:5173`

---

## 🔑 Getting your own YouTube API key (required — one per teammate)

Learning paths pull real video links from the YouTube Data API. **Every teammate needs their own key in their own Google Cloud project.**

> **Why can't we share one key?** YouTube quota is **10,000 units/day per Google Cloud *project*** (not per key), and each search costs 100 units. One path generation runs ~30+ searches ≈ 3,200 units — so a single shared project supports only ~3 path generations per day *for the whole team*. Separate projects = separate quota pools.

#### 1. Create a Google Cloud project
Go to [Google Cloud Console](https://console.cloud.google.com/) → project dropdown (top bar) → **New Project**. Name it anything (e.g., `course-forge-dev`). Free, no billing needed.

#### 2. Enable the YouTube Data API
**APIs & Services → Library** → search **"YouTube Data API v3"** → **Enable**.

#### 3. Create the key
**APIs & Services → Credentials → Create Credentials → API key.**
- Under **API restrictions**, restrict the key to **YouTube Data API v3** only
- Leave **Application restrictions** as **None** (the key is used server-side from FastAPI)
- Skip "Authenticate through a service account" — not needed for YouTube

#### 4. Add it to your `.env`
```env
YOUTUBE_API_KEY=your-new-key
```
Restart the backend afterwards — `--reload` only watches `.py` files, so `.env` changes need a manual restart.

**How to tell it's working:** generate a path and the weeks include real YouTube links. If instead the backend logs show `⚠️ WARNING: YOUTUBE_API_KEY missing`, the key isn't being read. A `403` from the YouTube API usually means daily quota is exhausted — it resets at midnight Pacific time.

---

## 📖 API Endpoints

### Base URL
```
http://127.0.0.1:8000/api
```

### `POST /generate` — Generate a Learning Path
**Currently Implemented** ✅

Generate a personalized learning roadmap for any topic.

**Request:**
```json
{
  "topic": "Learn Python for Data Science",
  "experience_level": "intermediate",
  "hours_per_day": 2
}
```

**Response:**
```json
{
  "title": "Python for Data Science Learning Path",
  "calculated_total_weeks": 8,
  "daily_hours_commitment": 2,
  "weeks": [
    {
      "week_number": 1,
      "focus": "Python fundamentals and NumPy basics",
      "topics": ["Variables", "Data types", "NumPy arrays"],
      "practice": ["Install Python", "Write basic scripts"],
      "mini_exercise": "Create a NumPy array and perform basic operations",
      "live_resources": [
        {
          "title": "NumPy Tutorial",
          "url": "https://...",
          "source": "YouTube"
        }
      ]
    }
  ],
  "learning_outcomes": ["Understand Python basics", "Use NumPy effectively"]
}
```

---

### Authentication
**Implemented** ✅

All `/generate` and `/quiz/*` endpoints require a Bearer token. Accounts live in a local SQLite
database at `~/.course_forge/courseforge.db` (outside the repo, so deleting or re-cloning the
project never wipes your account; override with `DATABASE_PATH`) — passwords are stored only as
**bcrypt hashes** (one-way, unrecoverable by anyone, including developers).

- `POST /auth/register` — `{ "email", "username", "password" }` → `{ access_token, token_type, email, username }`
  (password 8–72 chars; username 3–32 chars, letters/numbers/underscores, stored lowercase)
- `POST /auth/login` — `{ "identifier", "password" }` → same response. **`identifier` is a username OR an email.** 401 on bad credentials
- `POST /auth/google` — `{ "credential" }` (a Google ID token) → same response. 401 if Google isn't configured
- `GET /auth/me` — `{ id, email, username, bio, has_password, has_google }`
- `PATCH /auth/me` — `{ username?, email?, bio? }`, all optional → the updated profile. 409 names the field on a collision
- `POST /auth/change-password` — `{ current_password?, new_password }`. `current_password` may be omitted only by a Google-only account setting its first password
- `POST /auth/forgot-password` / `POST /auth/forgot-username` — `{ "email" }` → **always** 200 with the same message, whether or not the account exists (so the endpoint can't be used to discover which emails are registered)
- `POST /auth/reset-password` — `{ "token", "new_password" }`

Send the token on protected calls: `Authorization: Bearer <access_token>`

**About the tokens.** The session JWT carries only the user id — no email or username — because those go stale the moment someone edits their profile; every route reads the profile from the database instead. Reset tokens are separate: they're 30-minute JWTs with an `aud: "pwreset"` claim (so one can never be replayed as a session token) plus a digest of the current password hash, which makes them **single-use for free** — changing the password invalidates any outstanding link with no extra table to maintain.

**Existing accounts** created before usernames existed are backfilled automatically on first boot, using the part of the email before the `@` (deduped with `_2`, `_3`… if that's taken). Change it any time in Profile Settings.

---

## 🗄️ Database location & data safety

The SQLite file lives at **`~/.course_forge/courseforge.db`** — outside the repo — so deleting,
re-cloning, or `git reset --hard`-ing the project never wipes accounts or saved paths. It's set by
the default `DATABASE_URL` in `services/database.py`; `.env` overrides it, and `DATABASE_PATH` still
works as the pre-SQLAlchemy alias. Both `*.db` and `.env` are gitignored, so no git operation can
touch your data or your API keys.

Two things *can* still cost you your local data, and neither is git's doing:

> ### ⚠️ 1. A merge can silently flip the DB path back
> `services/database.py` changes upstream from time to time. If a merge conflict there is resolved
> by taking the incoming side wholesale, the default reverts to the repo-local
> `backend/courseforge.db`. Nothing is deleted — but the app boots against a **fresh empty
> database** and every account looks like it vanished. After any merge that touches this file:
>
> ```bash
> git diff <remote>/main -- backend/services/database.py | grep -A3 DATABASE_URL
> # the ~/.course_forge default must still be there
> ```

> ### ⚠️ 2. New columns on existing tables — mostly handled now
> `metadata.create_all` still creates **missing tables only** and never runs `ALTER TABLE`.
> `init_db()` now compensates: `_add_missing_columns()` inspects every live table and adds any
> **nullable** column that's missing, so a teammate adding a `Column` no longer breaks your existing
> database. It's idempotent — a second boot is a silent no-op — and works on both SQLite and Azure SQL.
>
> **Still not covered:** a new **NOT NULL** column (skipped with a printed warning), a changed type,
> a dropped column, or anything needing a data backfill. Those still need hand-written SQL, or
> Alembic, which remains the eventual proper fix.

Cheap insurance before pulling backend changes:

```bash
cp ~/.course_forge/courseforge.db ~/.course_forge/courseforge.db.bak
```

---

### `POST /quiz/generate` — Generate a Quiz
**Implemented** ✅ *(Ollama `qwen3.5:9b` primary, Azure OpenAI fallback)*

Generate multiple choice and open-ended questions for a milestone.

**Request:**
```json
{
  "milestone": "Python fundamentals and NumPy basics",
  "week_number": 1
}
```

**Response:**
```json
{
  "week_number": 1,
  "milestone": "Python fundamentals and NumPy basics",
  "questions": [
    {
      "question_number": 1,
      "type": "multiple_choice",
      "question": "What is a NumPy array?",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "A"
    },
    {
      "question_number": 4,
      "type": "open_ended",
      "question": "Explain when you would use a NumPy array over a Python list."
    }
  ]
}
```

---

### `POST /quiz/submit` — Grade Quiz Answers
**Implemented** ✅ *(MCQs graded deterministically; open-ended answers graded by AI)*

Submit quiz answers and receive AI-powered feedback.

**Request:**
```json
{
  "week_number": 1,
  "milestone": "Python fundamentals and NumPy basics",
  "questions": [...],
  "answers": [
    { "question_number": 1, "answer": "A" },
    { "question_number": 2, "answer": "True, because..." }
  ]
}
```

**Response:**
```json
{
  "week_number": 1,
  "score": 4,
  "total": 5,
  "passed": true,
  "feedback": [
    { "question_number": 1, "correct": true, "explanation": "..." }
  ],
  "overall_feedback": "Great understanding of the fundamentals!"
}
```

---

## 🤖 AI Model Routing

### Current Implementation
- **Azure OpenAI** — Generates personalized learning paths (configurable deployment)
- **Ollama (qwen3.5:9b)** — Primary model for quiz generation and open-ended answer grading
- **Automatic fallback** — If Ollama is unreachable (not running locally, or the backend is deployed to Azure without an Ollama host), quiz calls transparently fall back to Azure OpenAI
- **Deterministic MCQ grading** — Multiple-choice answers are scored in code against the stored correct answer; only open-ended answers go to the LLM

### Why Two Models?
- **Azure OpenAI** excels at complex curriculum design and understanding nuanced learning requirements
- **Ollama's qwen3.5:9b** efficiently generates and grades quizzes locally, reducing API costs and latency

---

## 🧪 Testing the API

### Option 1: Swagger UI (Recommended)
1. Start the backend: `uvicorn main:app --reload`
2. Open `http://127.0.0.1:8000/docs`
3. Click an endpoint → "Try it out" → Fill in request → "Execute"

### Option 2: cURL
Protected endpoints need a Bearer token — register once, then pass it in the header:
```bash
# 1. Register (or /api/auth/login if the account exists) and grab the access_token
curl -X POST "http://127.0.0.1:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"atleast8chars"}'

# 2. Call protected endpoints with the token
curl -X POST "http://127.0.0.1:8000/api/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"topic":"Learn Python","experience_level":"beginner","hours_per_day":2}'
```

### Option 3: Frontend UI
1. Start the backend and frontend
2. Open `http://localhost:5173`
3. Fill in the form and generate a path

---

## 🛠️ Setting Up Ollama for Quiz Generation

*This setup is optional — quiz endpoints automatically fall back to Azure OpenAI when Ollama isn't reachable. Run Ollama locally for free, low-latency quizzes.*

#### 1. Install Ollama
Download from https://ollama.com and follow installation instructions.

#### 2. Pull the required model
```bash
ollama pull qwen3.5:9b
```

**Note:** qwen3.5:9b requires ~6GB RAM. A machine with ≥16GB RAM is recommended.

#### 3. Start Ollama
```bash
ollama serve
```

#### 4. Update backend `.env`
```env
OLLAMA_HOST=http://localhost:11434
QUIZ_MODEL=qwen3.5:9b
```

---

## 📝 Project Contributions

### What my Partner (pratyushPtr) Built
- ✅ Full FastAPI backend with Azure OpenAI integration
- ✅ Learning path generation with dynamic timeline calculation
- ✅ Live resource fetching and injection
- ✅ React frontend with Vite and responsive UI
- ✅ CORS middleware for frontend-backend communication
- ✅ Dockerfiles for deployment

### What I'm Adding
- ✅ Ollama integration for quiz generation (`quiz_service.py`) with Azure OpenAI fallback
- ✅ `/api/quiz/generate` endpoint
- ✅ `/api/quiz/submit` endpoint with AI grading
- ✅ Quiz model routing and prompt engineering
- ✅ User accounts: register/login (SQLite + bcrypt + JWT) protecting all generation endpoints
- ✅ Frontend login/signup gate with persistent sessions and logout
- ✅ Light/dark mode with semantic Tailwind v4 tokens and a system-preference default
- ✅ Usernames + login by username *or* email, with automatic backfill for pre-existing accounts
- ✅ Profile Settings screen (username / email / password / "About me" bio)
- ✅ Account recovery: forgot username, forgot password, single-use signed reset links
- ✅ Optional Google Sign-In (Google Identity Services + `google-auth` verification, with account linking)
- ✅ Auto-migrating schema — `init_db()` adds missing nullable columns so new columns don't break existing databases

---

## 🚀 Deployment

### The whole stack, one command

`compose.yaml` at the repo root runs both containers together. This is the
recommended way to deploy — on a VPS, a home server, or just to check the
production build locally.

```bash
cp .env.example .env          # only VITE_GOOGLE_CLIENT_ID lives here; optional
docker compose up -d --build
curl localhost:8080/api/health/db
```

The app is then on `http://127.0.0.1:8080`.

What the file does, and why:

| | |
|---|---|
| `api` publishes **no** host port | Reachable only from `web` over the compose network. Nothing talks to the backend except nginx. |
| `web` publishes `127.0.0.1:8080` | Loopback only. A tunnel or reverse proxy is the front door; there is nothing to firewall. |
| nginx proxies `/api` → `api:8000` | The browser sees **one origin**, so CORS never enters the picture and only one hostname needs to be exposed. |
| Named volume `cf-data` → `/root/.course_forge` | The database. `docker compose down`, image rebuilds and `docker system prune` all leave it alone. |

**`VITE_*` variables are baked in at build time.** Vite inlines them into the
bundle; the container never reads them at runtime. After changing either one:

```bash
docker compose up -d --build web
```

**Individual containers**, if you want just one:

```bash
cd backend  && docker build -t course-forge-backend . && docker run -p 8000:8000 --env-file .env course-forge-backend
cd frontend && docker build -t course-forge-web . && docker run -p 8080:80 course-forge-web
```

Note the frontend image on its own has no backend to proxy `/api` to — nginx
will fail to start. Use compose.

---

## 🏠 Self-hosting on your own machine

Running Course Forge on hardware you own, reachable from the internet, without
opening a single inbound port. A [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
dials *out* from your machine, so there is no port forwarding, no dynamic DNS,
and TLS is terminated by Cloudflare.

> This replaces cloud **hosting** cost only. Azure OpenAI is billed per token and
> costs exactly the same wherever the app runs.

### 1. Sanity-check the nginx config first

Five seconds, and it saves you finding out after a long build:

```bash
docker run --rm -v "$PWD/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:stable-alpine nginx -t
```

### 2. Build on the target machine

```bash
git clone <this repo> /opt/course-forge && cd /opt/course-forge
cp backend/.env.example backend/.env   # fill in Azure, YouTube, JWT_SECRET
cp .env.example .env                   # VITE_GOOGLE_CLIENT_ID, if you use it
docker compose up -d --build
```

Build **on the machine that will run it**. An Apple Silicon Mac produces arm64
images; most servers are x86_64. Cross-building needs
`docker buildx --platform linux/amd64`.

Expect the first build to be slow on modest hardware — `npm install` plus
`vite build`, and the backend image compiles the Microsoft ODBC driver layer
(needed only for Azure SQL, harmless on SQLite).

### 3. Point `backend/.env` at your real domain

```bash
ALLOWED_ORIGINS=https://courseforgeapp.ai
FRONTEND_URL=https://courseforgeapp.ai   # base of every emailed password-reset link
GOOGLE_CLIENT_ID=<same value as VITE_GOOGLE_CLIENT_ID in the root .env>
```

`FRONTEND_URL` is the one that bites: left at `localhost:5173`, recovery emails
go out with links to nothing. Note it takes a **container restart**
(`docker compose up -d api`), not a rebuild — the backend reads env at runtime.

Leave `DATABASE_URL` unset. The volume plus `HOME=/root` gives you the documented
default path inside the container — don't invent a third location.

> **The domain is not compiled into the frontend.** Because `VITE_API_BASE_URL`
> is empty, the app calls `/api/...` relative to whatever host served it. You can
> add, change or move hostnames without ever rebuilding. The *only* build-time
> value is `VITE_GOOGLE_CLIENT_ID`.

### 4. Cloudflare Tunnel

Needs a domain on Cloudflare. (A `trycloudflare.com` quick tunnel works for a
smoke test but hands out a new random hostname every restart, which breaks Google
sign-in and reset links each time.)

```bash
cloudflared tunnel login
cloudflared tunnel create courseforge
cloudflared tunnel route dns courseforge courseforgeapp.ai
cloudflared tunnel route dns courseforge www.courseforgeapp.ai
```

Each `route dns` creates a **proxied** CNAME (orange cloud). Proxied is required
— a grey-cloud record bypasses the tunnel and resolves to nothing.

`/etc/cloudflared/config.yml`:

```yaml
tunnel: courseforge
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: courseforgeapp.ai
    service: http://localhost:8080
  - hostname: www.courseforgeapp.ai
    service: http://localhost:8080
  - service: http_status:404
```

```bash
sudo cloudflared service install   # survives reboots
sudo systemctl status cloudflared
```

`www` is routed through the tunnel but never actually serves the app — nginx
301s it to the bare domain (see `frontend/nginx.conf`). That redirect matters
more than it looks: **the session JWT lives in localStorage, which is scoped per
origin.** If both hostnames served the app, a user who signed in on `www` and
later landed on the apex would silently appear logged out.

### 5. Cloudflare dashboard settings

Defaults are mostly fine. These four are worth setting deliberately:

| Setting | Value | Why |
|---|---|---|
| SSL/TLS → Overview | **Full (strict)** | Tunnel traffic already bypasses this, but *Flexible* causes redirect loops the moment any non-tunnel record exists. Don't leave it on Flexible. |
| SSL/TLS → Edge Certificates → **Always Use HTTPS** | **On** | Upgrades `http://` visitors before they reach the tunnel. |
| Speed → Optimization → **Rocket Loader** | **Off** | It defers and reorders `<script>` tags. It breaks React apps and the landing page's inline scripts. |
| Security → Bots → **Bot Fight Mode** | **Off** initially | It can challenge legitimate XHR and produce 403s that look like app bugs. Turn it on later, deliberately, if you need it. |

Leave **HSTS off** until the site has been stable for a while — it is a
long-lived, hard-to-undo commitment enforced by browsers, not by you.

Universal SSL covers the apex and one level of subdomain, so both
`courseforgeapp.ai` and `www.courseforgeapp.ai` get certificates automatically.

### 6. Add the domain to Google OAuth

In [Google Cloud Console](https://console.cloud.google.com) → APIs & Services →
Credentials → your OAuth client → **Authorized JavaScript origins**, add:

```
https://courseforgeapp.ai
https://www.courseforgeapp.ai      # belt and braces; the redirect means it's never actually used
```

No scheme mismatch, no trailing slash, no port. Redirect URIs are not needed —
Google Identity Services uses the origin only.

Two things that fail *silently* here:

- **An unlisted origin.** No error, no console message, the button just does
  nothing. Check this before debugging anything else about the login.
- **A consent screen still in "Testing".** Only accounts you've added as test
  users can sign in; everyone else is refused. Publish the app (OAuth consent
  screen → **Publish app**) before anyone but you uses it.

### 7. Back up the database

`ops/backup-db.sh` takes a consistent snapshot out of the `cf-data` volume using
sqlite3's backup API (safe on a live database, unlike `cp`), gzips it, and prunes
anything older than 30 days.

```bash
./ops/backup-db.sh                        # → ~/backups/courseforge/
./ops/backup-db.sh /mnt/backup-hdd        # → wherever you point it
```

Nightly, via `crontab -e`:

```cron
15 3 * * * /opt/course-forge/ops/backup-db.sh >> /var/log/cf-backup.log 2>&1
```

**A backup on the same disk as the database is not a backup.** It protects
against a bad migration or app-level corruption, not against the drive failing.
Point it at a second physical disk, and/or set `CF_BACKUP_REMOTE` to an ssh
target to mirror off the box entirely:

```cron
15 3 * * * CF_BACKUP_REMOTE=user@other-machine:~/backups/courseforge /opt/course-forge/ops/backup-db.sh >> /var/log/cf-backup.log 2>&1
```

Restore is just a file copy — stop the stack, gunzip, and put it back:

```bash
docker compose stop api
gunzip -c ~/backups/courseforge/courseforge-<stamp>.db.gz > /tmp/restore.db
docker compose cp /tmp/restore.db api:/root/.course_forge/courseforge.db
docker compose start api
```

### Known limits of this setup

- **Cloudflare's free plan times a request out at 100 seconds** (a 524). Path
  generation measures ~33s, so there's room — but a slow Azure day could brush
  it. The real fix is response streaming, not a bigger nginx timeout.
- **Rate limiting depends on the client IP reaching the backend.** nginx sets
  `X-Forwarded-For` from Cloudflare's `CF-Connecting-IP` (which Cloudflare
  overwrites at the edge, so a client can't forge it) and
  `services/rate_limit.py` reads the first entry. Limits therefore key off the
  real visitor, not nginx's container IP. This can't be bypassed from outside
  because the backend publishes no host port — **don't add one.**
- **One instance, in-memory rate-limit counters.** Fine as-is. Running two
  backends means setting `RATE_LIMIT_STORAGE_URI` to a Redis URL so the counters
  are shared.

---

## 🎨 Brand

Everything visual comes from the logo (`frontend/src/assets/logo-source.png`).
Both colours were sampled out of the artwork, not picked by eye.

| Role | Light | Dark |
|---|---|---|
| **Forge navy** — text, primary action, the dark slab | `#0B1B2B` | `#E9EFF5` (inverts) |
| **Ember** — links, focus, active states | `#AB5C00` | `#FF8900` |
| Page / card | `#F4F6F8` / `#FFFFFF` | `#071019` / `#0F1E2D` |

Ember is an **accent**, not a second primary — that's the ratio it holds in the
logo, where it's about 8% of the non-white pixels. Painting every button orange
stops it reading as this brand.

**Why two ember values.** The literal logo orange `#FF8900` measures **2.38:1**
on white — unreadable as text. `#AB5C00` is the same 32° hue at 67% value, which
still reads as the logo's orange but clears 4.5:1 on both the page and the card.
On the dark ground the raw ember is fine (7.1:1), so it's used directly there.
`--color-ember` is always the literal logo colour, for fills and marks where a
shape carries the contrast rather than text.

Every text/background pair in the UI was contrast-checked in both themes.

**Type.** [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) for the
wordmark and page headings — its clipped, squared letterforms are an exact match
for the logo's. Body copy stays on the system stack: more readable, and no
download. Use `font-brand` for display text only.

**Tokens live in `frontend/src/index.css`.** Use them (`bg-brand`, `text-accent`,
`bg-slab`) rather than raw Tailwind colours, so a future palette change is one
file. The exceptions are deliberate: rose and emerald stay hardcoded because they
carry meaning (error, success) rather than brand.

Two places keep their own copy of the palette because they can't read the app's
stylesheet, and both say so in a comment: `utils/roadmapExport.js` (the PDF opens
in a detached window) and `public/landing/index.html` (a separate document).

**Logo assets** — `Logo.jsx` picks the variant from the theme in JS, so only one
file downloads:

| File | Use |
|---|---|
| `logo-mark.png` / `logo-mark-light.png` | the anvil alone — navbar |
| `logo-full.png` / `logo-full-light.png` | anvil + wordmark — sign-in |
| `public/favicon-32.png`, `apple-touch-icon.png`, `icon-512.png` | light mark on a navy tile, so it reads on light *and* dark tab bars |

The `-light` variants lift the navy to near-white for dark backgrounds; the ember
is identical in both, since it's the one colour that reads on either ground.

---

## 📦 Deploying updates

Code moves laptop → GitHub → server. The server never has work of its own; it is
a clean mirror of a remote branch.

### On your laptop

```bash
git push origin main        # or wherever the server tracks
```

### On the server

```bash
cd /opt/course-forge
./ops/deploy.sh
```

That's the whole workflow. `deploy.sh` does, in order:

1. **Refuses if the checkout is dirty.** A production tree is a mirror, not a
   workspace.
2. **Refuses anything that isn't a fast-forward.** Divergence means a force-push
   or a stray local commit; either deserves a human.
3. **Prints every incoming commit and changed file, then asks.** It calls out
   changes to `compose.yaml`, either `Dockerfile`, `nginx.conf`,
   `requirements.txt` or `database.py` explicitly, because those are the ones
   that break a deploy rather than a feature.
4. **Backs up the database** — before the new code can touch it.
5. `git merge --ff-only`, then `docker compose up -d --build`.
6. **Gates on health:** polls `/api/health/db` *and* fetches a client-side route
   to confirm nginx is serving the SPA. The API being up doesn't prove the
   frontend built.
7. **Rolls back automatically** if that gate fails — resets to the previous
   commit, rebuilds, and tells you the bad commit range.

`./ops/deploy.sh -y` skips the confirmation prompt.

### Things worth knowing

**`.env` files are gitignored, so they live only on the server.** `git pull`
never touches them. When you add a new variable, add it on the server by hand —
nothing will remind you.

**A build failure costs zero downtime.** Compose builds images first and only
then recreates containers, so a broken build leaves the running version serving.
Actual downtime is a container restart, a few seconds.

**Changing `VITE_GOOGLE_CLIENT_ID` needs a rebuild**, not a restart — Vite inlines
it. Everything in `backend/.env` is read at runtime, so
`docker compose up -d api` is enough for those.

**First deploy on a fresh machine** needs the repo cloned and both `.env` files
in place; see "Self-hosting" above. If the repo is private, give the server a
read-only deploy key:

```bash
ssh-keygen -t ed25519 -C "veriton-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub    # GitHub → repo → Settings → Deploy keys → Add (leave write access OFF)
```

**Pushing to two remotes.** If you keep a personal mirror alongside the team
repo, make one push reach both:

```bash
git remote set-url --add --push origin git@github.com:alibhatti02/Learning-Path-Generator-Group-Project.git
git remote set-url --add --push origin git@github.com:AliXperia71/Learning-Path-Generator.git
```

After that `git push origin main` writes to both. (Adding the first push URL
replaces the implicit default, which is why both lines are needed.)

**Deploying from a shared repo is a deliberate choice.** The server tracks a
branch other people can merge into, so a teammate's PR is one command away from
your live domain. `deploy.sh` is manual and shows you the diff precisely so that
command is never an accident. If that ever stops feeling like enough, point the
server at a `production` branch you fast-forward yourself.

---

## 🐛 Troubleshooting

### `400 API version not supported` on /api/generate

Almost always the **endpoint**, not the API version — the message is misleading.

Azure AI Foundry shows you two URLs. Use the **resource** one:

```
✅  https://<resource>.services.ai.azure.com/
❌  https://<resource>.services.ai.azure.com/api/projects/<project>
```

The second is the *project* endpoint, for the `azure-ai-projects` SDK. The
`AzureOpenAI` client appends `/openai/deployments/<name>/chat/completions` to
whatever you give it, so a project URL builds a route that doesn't exist, and the
gateway rejects it with a generic 400 that blames the API version.

Quick way to tell them apart: if `AZURE_OPENAI_ENDPOINT` has a path after the
hostname, it's wrong. Fix it and restart the backend — `.env` is read at import,
so `--reload` alone won't pick it up.

### Backend won't start
- Ensure Python 3.11+ is installed: `python --version`
- Verify virtual environment is activated
- Check `.env` file has all required Azure credentials

### Frontend can't connect to backend
- Ensure backend is running on `http://127.0.0.1:8000`
- Check CORS `ALLOWED_ORIGINS` in backend `.env`
- Open browser console (F12) for error messages

### Ollama errors
- Verify Ollama is running: `ollama serve` in a separate terminal
- Check model is installed: `ollama list` (and that it matches `QUIZ_MODEL` in `.env`)
- Verify `OLLAMA_HOST` in `.env` matches your setup
- Quizzes still work without Ollama — they fall back to Azure OpenAI (check backend logs for the fallback warning)

### Missing video resources / YouTube warnings
- `⚠️ WARNING: YOUTUBE_API_KEY missing` in backend logs → add your key to `.env` (see [Getting your own YouTube API key](#-getting-your-own-youtube-api-key-required--one-per-teammate)) and restart the backend
- Paths generate but weeks have no video links → same cause as above, or your daily YouTube quota ran out (`429` errors in logs); quota resets at midnight Pacific time
- **Good news:** When quota is exhausted or the key is missing, you get clickable YouTube search links (e.g., "Search YouTube: NumPy arrays") instead of empty resources. Real video links are fetched and cached as soon as quota resets.
- Remember: `.env` changes require a **manual** backend restart — `--reload` only watches `.py` files

### Login/session issues
- "Session expired" on every restart → set a fixed `JWT_SECRET` in `.env`. (Note: `main.py` must call `load_dotenv()` **before** importing the routers, or `.env` is read too late and the app silently falls back to a random per-boot secret.)
- 401 on `/api/generate` or `/api/quiz/*` → the request is missing/expired its `Authorization: Bearer` token; log in again
- `422 Unprocessable Entity` on `/api/auth/login` → you're on an old frontend. The login body is now `{ identifier, password }`, not `{ email, password }` — pull the latest and rebuild
- `OperationalError: no such column: users.username` → you're on an old backend, or `init_db()` never ran. Restart the backend; it adds missing nullable columns automatically on boot

### Account recovery / email
- **No reset email arrived** → expected unless `SMTP_HOST` is set. The message prints to the terminal running `uvicorn` instead — look for a `📧 EMAIL (not sent …)` block and copy the `?reset=…` link out of it
- Gmail rejects the login → `SMTP_PASS` must be an **App Password**, not your account password, and 2-Step Verification has to be on
- Real emails send but never arrive → check Spam. Mail you send from your own address to your own address is commonly filtered
- "That reset link has already been used" → each link dies the moment the password changes. Request a fresh one
- The confirmation looks identical for an unregistered email — that's deliberate, so the endpoint can't be used to discover which addresses have accounts

### Google Sign-In
- Button doesn't appear → `VITE_GOOGLE_CLIENT_ID` isn't set in `frontend/.env`, or the dev server wasn't restarted (Vite only reads env vars at startup)
- `401 "Google sign-in isn't configured on this server."` → the backend is missing `GOOGLE_CLIENT_ID`. It must be the **same** client ID as the frontend's
- `401 "Google sign-in isn't available — the server is missing google-auth."` → run `pip install -r requirements.txt`
- Google console error about the origin → add `http://localhost:5173` under **Authorized JavaScript origins** (not redirect URIs)

---

## 📚 Resources

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Ollama Documentation](https://ollama.com/)
- [Azure OpenAI API](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)

---

## 👥 Team

| Role | Responsibility |
|------|-----------------|
| **pratyushPtr** | Full-stack development (FastAPI backend, React frontend, Azure OpenAI integration) |
| **You** | Ollama integration for quiz generation, prompt engineering, deployment |

---

## 📌 Notes for Developers

- **No keys in code:** All credentials live in `.env` — never commit them
- **API key protection:** Error logs are scrubbed to prevent accidental key exposure (e.g., when sharing terminal output). YouTube API key leaks are removed before printing.
- **Use `--reload` during dev:** Backend auto-restarts on file changes
- **Check Swagger:** Open `/docs` to explore endpoints and schemas
- **Passwords are unrecoverable by design:** Only bcrypt hashes touch the database — there is no way (and no backdoor) to read a user's password
- **Known MVP tradeoff:** Generated quizzes include `correct_answer` in the payload the browser echoes back on submit, so grading stays stateless. Moving quiz storage server-side (planned with DB persistence) closes this
- **Model configs are flexible:** Override model names via `.env` without touching code
- **Graceful fallbacks:** Missing YouTube key or quota exhaustion → search links. Ollama down → Azure OpenAI handles quizzes. Resource fetches never crash the app.

---

**Last updated:** July 2026  
**Status:** Pathway generation, user accounts, and quiz generation/grading all live
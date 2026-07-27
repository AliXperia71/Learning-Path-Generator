-- =========================================================
-- AI Learning Path Generator — Database Schema (PostgreSQL)
-- =========================================================
-- Notes:
-- - Uses UUID primary keys (swap to SERIAL/BIGSERIAL if you prefer ints)
-- - Timestamps use TIMESTAMPTZ so timezones aren't a headache later
-- - Passwords: NEVER store plaintext. Store a bcrypt/argon2 hash only.
-- =========================================================

-- CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()
-- Uncomment the above line if using PostgreSQL. For other databases, use equivalent UUID generation functions.

-- ---------------------------------------------------------
-- 1. USERS & AUTH
-- ---------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT,              -- NULL if user only uses OAuth
    display_name    TEXT,
    avatar_url      TEXT,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ        -- soft delete
);

-- If you support Google/GitHub/etc login in addition to email+password
CREATE TABLE oauth_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,       -- 'google', 'github', etc.
    provider_user_id TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_user_id)
);

-- Login sessions / refresh tokens (if not using pure JWT)
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
-- ---------------------------------------------------------
-- 2. LEARNING PATHS
-- ---------------------------------------------------------

CREATE TABLE learning_paths (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    goal            TEXT,             -- e.g. "Become job-ready in data science"
    skill_level     TEXT,             -- 'beginner' | 'intermediate' | 'advanced'
    status          TEXT NOT NULL DEFAULT 'active', -- 'active','completed','archived'
    generated_by_ai BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_paths_user_id ON learning_paths(user_id);

-- Each path is broken into ordered steps/modules
CREATE TABLE learning_path_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL,     -- 1, 2, 3... for ordering
    title           TEXT NOT NULL,
    description     TEXT,
    resource_url    TEXT,                 -- link to article/video/course
    resource_type   TEXT,                 -- 'video','article','exercise','quiz'
    status          TEXT NOT NULL DEFAULT 'not_started', -- 'not_started','in_progress','completed'
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_steps_path_id ON learning_path_steps(learning_path_id);
CREATE UNIQUE INDEX idx_steps_order ON learning_path_steps(learning_path_id, step_order);

-- ---------------------------------------------------------
-- 3. CHAT / CONVERSATIONS
-- ---------------------------------------------------------

CREATE TABLE chats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    learning_path_id UUID REFERENCES learning_paths(id) ON DELETE SET NULL, -- optional link
    title           TEXT,             -- auto-generated summary title
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chats_user_id ON chats(user_id);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id         UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,      -- 'user','assistant','system'
    content         TEXT NOT NULL,
    token_count     INTEGER,            -- useful for cost/usage tracking
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(chat_id, created_at);

-- ---------------------------------------------------------
-- 4. OPTIONAL: USAGE / SUBSCRIPTION TRACKING
-- ---------------------------------------------------------

CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    [plan]   TEXT NOT NULL DEFAULT 'free', -- 'free','pro','team'
    status          TEXT NOT NULL DEFAULT 'active',
    current_period_end TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_usage_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id         UUID REFERENCES chats(id) ON DELETE SET NULL,
    model           TEXT,
    prompt_tokens   INTEGER,
    completion_tokens INTEGER,
    cost_usd        NUMERIC(10,6),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_user_id ON ai_usage_logs(user_id);



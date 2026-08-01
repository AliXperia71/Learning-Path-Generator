import os
import shutil
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator
from urllib.parse import quote_plus

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Unicode,
    UnicodeText,
    UniqueConstraint,
    create_engine,
    event,
    inspect,
    text,
)
from sqlalchemy.dialects import mssql
from sqlalchemy.engine import Connection

# Unbounded unicode text. Plain UnicodeText renders as the DEPRECATED NTEXT on
# SQL Server, so map it to NVARCHAR(MAX) there; stays TEXT on SQLite.
BIG_TEXT = UnicodeText().with_variant(mssql.NVARCHAR(None), "mssql")

# ---------------------------------------------------------------------------
# Engine — same code runs on SQLite locally and Azure SQL in production.
# Resolution order:
#   1. DATABASE_URL             — full SQLAlchemy URL, used verbatim
#   2. DB_SERVER/DB_NAME/DB_USER/DB_PASS — composed into an Azure SQL URL
#      (how the Container App is configured; DB_PASS comes from a secret ref)
#   3. sqlite:///~/.course_forge/courseforge.db — local dev default
#      (DATABASE_PATH overrides the file location)
#
# The local default lives in the home dir, not the repo, so deleting or
# re-cloning the project never wipes accounts and saved paths.
# pool_pre_ping recovers connections Azure silently drops after idle periods.
# ---------------------------------------------------------------------------
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.path.join(os.path.expanduser("~"), ".course_forge")
os.makedirs(_DATA_DIR, exist_ok=True)
_DB_FILE = os.path.join(_DATA_DIR, "courseforge.db")

# One-time migration: adopt an existing repo-local DB so current data carries over
_LEGACY_DB_PATH = os.path.join(_BACKEND_DIR, "courseforge.db")
if not os.path.exists(_DB_FILE) and os.path.exists(_LEGACY_DB_PATH):
    shutil.copy2(_LEGACY_DB_PATH, _DB_FILE)


def _compose_mssql_url() -> "str | None":
    server = os.getenv("DB_SERVER")
    name = os.getenv("DB_NAME")
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASS")
    if not all((server, name, user, password)):
        return None
    # quote_plus so special characters in credentials can't break URL parsing
    return (
        f"mssql+pyodbc://{quote_plus(user)}:{quote_plus(password)}@{server}:1433/{name}"
        "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
    )


# DATABASE_PATH is the pre-SQLAlchemy override, kept working for existing setups
_sqlite_path = os.getenv("DATABASE_PATH", _DB_FILE)
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or _compose_mssql_url()
    or f"sqlite:///{_sqlite_path}"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


# SQLite disables foreign-key enforcement per-connection, so ON DELETE CASCADE
# would silently do nothing without this. Azure SQL enforces FKs natively, so
# this hook is scoped to the SQLite dialect only.
if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fks(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


metadata = MetaData()

# Column type choices:
#   Unicode / UnicodeText  -> NVARCHAR on SQL Server: any column holding raw user
#     or AI text (names, topics, milestones, search queries, JSON payloads) so
#     emoji and non-Latin characters survive. VARCHAR would corrupt them.
#   String                 -> VARCHAR: machine/ASCII-only values (bcrypt hash,
#     hex invite code, enum-ish status/level). Cheaper, and never non-ASCII.
# Index/PK/UNIQUE string columns must be length-bounded (SQL Server caps key size;
# NVARCHAR keys cap at 450 chars).

# NOTE on username/google_id: uniqueness is enforced by the filtered indexes in
# _ensure_unique_indexes(), NOT by unique=True here. They were added to an
# existing table, and SQLite flatly rejects `ALTER TABLE ... ADD COLUMN ... UNIQUE`.
# password_hash stays NOT NULL: Google-only accounts store "" (see auth_service.
# NO_PASSWORD) because dropping a NOT NULL on SQLite means rebuilding the table.
users = Table(
    "users", metadata,
    Column("id", Integer, primary_key=True),
    Column("email", Unicode(254), nullable=False, unique=True),
    Column("username", Unicode(32)),
    Column("bio", Unicode(500)),
    Column("google_id", String(64)),
    Column("password_hash", String(255), nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)

# Saved roadmap sessions — one row per generated path, newest first in the UI
learning_paths = Table(
    "learning_paths", metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("title", Unicode(300), nullable=False),
    Column("topic", Unicode(300), nullable=False),
    Column("experience_level", String(50), nullable=False),
    Column("hours_per_day", Integer, nullable=False),
    Column("roadmap_json", BIG_TEXT, nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)

# YouTube search cache — repeated queries cost 0 quota units instead of 100
youtube_cache = Table(
    "youtube_cache", metadata,
    Column("query", Unicode(450), primary_key=True),
    Column("results_json", BIG_TEXT, nullable=False),
    Column("cached_at", DateTime, default=datetime.utcnow, nullable=False),
)

# A group is a shared topic up to 6 people compete on. invite_code is how others join.
groups = Table(
    "groups", metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Unicode(100), nullable=False),
    Column("skill_topic", Unicode(200), nullable=False),
    Column("experience_level", String(50), nullable=False, default="beginner"),
    Column("invite_code", String(32), nullable=False, unique=True),
    Column("created_by", Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("max_members", Integer, nullable=False, default=6),
    Column("status", String(20), nullable=False, default="active"),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)

# user_id FKs on the tables below deliberately have NO ondelete: SQL Server
# rejects tables reachable by multiple cascade paths (users -> here directly
# AND via groups.created_by), and the app never deletes users. Group deletion
# is the real flow and keeps its CASCADE. If user deletion is ever added,
# remove the user's memberships/progress/attempts in app code first.

# One row per (group, user). hourly_commitment / calculated_weeks / roadmap_json are
# PRIVATE fields — group_service.py must never let these leave the owning user's own request.
group_members = Table(
    "group_members", metadata,
    Column("id", Integer, primary_key=True),
    Column("group_id", Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("hourly_commitment", Float),
    Column("calculated_weeks", Integer),
    Column("roadmap_json", BIG_TEXT),
    Column("current_week", Integer, nullable=False, default=0),
    Column("total_points", Integer, nullable=False, default=0),
    Column("status", String(20), nullable=False, default="pending_hours"),
    Column("completed_at", DateTime),
    Column("joined_at", DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint("group_id", "user_id", name="uq_group_member"),
)

# One row per member per week — backs both the leaderboard and each member's own pace view.
group_progress = Table(
    "group_progress", metadata,
    Column("id", Integer, primary_key=True),
    Column("group_id", Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("week_number", Integer, nullable=False),
    Column("quiz_score", Integer),
    Column("quiz_total", Integer),
    Column("points_earned", Integer, nullable=False, default=0),
    Column("completed_at", DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint("group_id", "user_id", "week_number", name="uq_group_week"),
)

# One row per quiz the user generates. questions_json holds the full questions WITH
# their correct answers and is NEVER sent to the client — grading loads it here
# server-side. group_id is set for group quizzes, null for standalone ones.
quiz_attempts = Table(
    "quiz_attempts", metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("group_id", Integer, ForeignKey("groups.id", ondelete="CASCADE")),
    Column("milestone", Unicode(300), nullable=False),
    Column("week_number", Integer, nullable=False),
    Column("questions_json", BIG_TEXT, nullable=False),
    Column("score", Integer),
    Column("total", Integer),
    Column("status", String(20), nullable=False, default="pending"),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)


@contextmanager
def get_db() -> Iterator[Connection]:
    """Yields a connection inside a transaction that commits on success,
    rolls back on error, and always closes — same contract as before."""
    with engine.begin() as conn:
        yield conn


def slug_username(raw: str) -> str:
    """Turns an email prefix or display name into a legal username: lowercase,
    [a-z0-9_] only, 3-32 chars. Shared with auth_service so the rules for a
    backfilled username and a Google-derived one can't drift apart."""
    cleaned = "".join(c if c.isalnum() or c == "_" else "_" for c in (raw or "").lower())
    cleaned = cleaned.strip("_")[:32]
    if len(cleaned) < 3:
        cleaned = f"user_{cleaned}" if cleaned else "user"
    return cleaned


# ---------------------------------------------------------------------------
# Lightweight auto-migration.
#
# metadata.create_all() only ever creates MISSING TABLES — it will never add a
# column to a table that already exists. Without this, any new Column silently
# breaks every existing database with "no such column" at runtime.
#
# This closes that gap for the common case (adding a nullable column). Anything
# harder — dropping a column, changing a type, adding a NOT NULL — is reported
# and left alone; that genuinely needs Alembic.
# ---------------------------------------------------------------------------

def _add_missing_columns(conn: Connection) -> None:
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())

    for table in metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all just made it, so it's already current
        live_columns = {c["name"] for c in inspector.get_columns(table.name)}

        for column in table.columns:
            if column.name in live_columns:
                continue
            if not column.nullable:
                print(
                    f"⚠️ {table.name}.{column.name} is NOT NULL and missing from the "
                    "existing table — skipping. Add it by hand or start from a fresh DB."
                )
                continue

            col_type = column.type.compile(dialect=conn.dialect)
            conn.exec_driver_sql(f"ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}")
            print(f"🛠  Added missing column {table.name}.{column.name} ({col_type})")


def _ensure_unique_indexes(conn: Connection) -> None:
    """Uniqueness for columns added after the fact. Filtered so multiple NULLs are
    allowed — SQL Server treats NULLs as equal in a plain unique index, SQLite
    doesn't, and the WHERE clause makes both behave the same way."""
    statements = {
        "ux_users_username": "CREATE UNIQUE INDEX ux_users_username ON users (username) WHERE username IS NOT NULL",
        "ux_users_google_id": "CREATE UNIQUE INDEX ux_users_google_id ON users (google_id) WHERE google_id IS NOT NULL",
    }
    existing = {idx["name"] for idx in inspect(conn).get_indexes("users")}
    for name, sql in statements.items():
        if name not in existing:
            conn.exec_driver_sql(sql)
            print(f"🛠  Created unique index {name}")


def _backfill_usernames(conn: Connection) -> None:
    """Accounts that predate usernames get one derived from their email prefix,
    deduped with _2, _3… Runs once — after this there are no NULL usernames."""
    rows = conn.execute(
        text("SELECT id, email FROM users WHERE username IS NULL")
    ).mappings().all()
    if not rows:
        return

    taken = {
        r[0] for r in conn.execute(text("SELECT username FROM users WHERE username IS NOT NULL"))
    }
    for row in rows:
        base = slug_username(row["email"].split("@")[0])
        candidate = base
        suffix = 2
        while candidate in taken:
            candidate = f"{base}_{suffix}"[:32]
            suffix += 1
        taken.add(candidate)
        conn.execute(
            text("UPDATE users SET username = :u WHERE id = :id"),
            {"u": candidate, "id": row["id"]},
        )
        print(f"🛠  Backfilled username for {row['email']} -> {candidate}")


def init_db() -> None:
    """Creates any missing tables, then brings existing ones up to date. Portable
    across SQLite and Azure SQL — SQLAlchemy emits the right DDL per dialect."""
    metadata.create_all(engine)
    with engine.begin() as conn:
        _add_missing_columns(conn)
        _ensure_unique_indexes(conn)
        _backfill_usernames(conn)

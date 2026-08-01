"""
Outbound email — stdlib smtplib only, no extra dependency.

If SMTP_HOST isn't configured the message is printed to the server console
instead of being sent. That keeps account recovery fully testable on a fresh
clone (copy the link out of the terminal) and turns into real delivery the
moment SMTP credentials land in .env.

Nothing in here raises: the forgot-password endpoint must return the same
response whether or not the address exists, so a delivery failure can never be
allowed to change the shape of the response.
"""
import os
import smtplib
from email.message import EmailMessage

# The base URL the reset link points at — the frontend dev server by default.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _console_fallback(to: str, subject: str, body: str) -> None:
    print("\n" + "=" * 68)
    print("📧 EMAIL (not sent — SMTP_HOST is unset, printing instead)")
    print(f"   To:      {to}")
    print(f"   Subject: {subject}")
    print("-" * 68)
    print(body)
    print("=" * 68 + "\n")


def send_email(to: str, subject: str, body: str) -> bool:
    """Best-effort send. Returns True if handed off to an SMTP server, False if
    it was printed to the console or delivery failed — callers must not branch
    on this in a way the client can observe."""
    host = os.getenv("SMTP_HOST")
    if not host:
        _console_fallback(to, subject, body)
        return False

    message = EmailMessage()
    message["From"] = os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "noreply@courseforge.app"))
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.send_message(message)
        return True
    except Exception as e:
        # Log the class only — never the message, which can echo credentials back
        print(f"⚠️ Email delivery failed ({type(e).__name__}); falling back to console.")
        _console_fallback(to, subject, body)
        return False


def send_password_reset(to: str, token: str) -> None:
    link = f"{FRONTEND_URL}/?reset={token}"
    send_email(
        to,
        "Reset your Course Forge password",
        "Someone asked to reset the password on your Course Forge account.\n\n"
        f"Open this link to choose a new one (it expires in 30 minutes):\n{link}\n\n"
        "If that wasn't you, you can ignore this email — nothing has changed.",
    )


def send_username_reminder(to: str, username: str) -> None:
    send_email(
        to,
        "Your Course Forge username",
        f"Your Course Forge username is: {username}\n\n"
        "You can sign in with either your username or this email address.",
    )

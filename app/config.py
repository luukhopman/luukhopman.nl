import hashlib
import os


def _normalize_cookie_domain(value: str | None) -> str | None:
    if not value:
        return None

    normalized = value.strip().lower()
    if "://" in normalized:
        normalized = normalized.split("://", 1)[1]
    normalized = normalized.lstrip(".").split("/", 1)[0]

    if normalized.count(":") == 1 and not normalized.startswith("["):
        normalized = normalized.split(":", 1)[0]

    return normalized or None


APP_PASSWORD = os.getenv("APP_PASSWORD")
AUTH_MAX_AGE_SECONDS = int(
    os.getenv("AUTH_MAX_AGE_SECONDS", str(10 * 365 * 24 * 60 * 60))
)
AUTH_TOKEN = hashlib.sha256(APP_PASSWORD.encode()).hexdigest() if APP_PASSWORD else None
AUTH_COOKIE_DOMAIN = _normalize_cookie_domain(
    os.getenv("AUTH_COOKIE_DOMAIN") or os.getenv("DOMAIN")
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

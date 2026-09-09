"""Django settings for the Inbox Triage backend."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [h for h in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "django_filters",
    "accounts",
    "inbox",
    "campaigns",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- DRF / CORS

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.LimitOffsetPagination",
    "PAGE_SIZE": 50,
    "UNAUTHENTICATED_USER": None,
}

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
CORS_ALLOWED_ORIGINS = [o for o in os.getenv("CORS_ALLOWED_ORIGINS", FRONTEND_ORIGIN).split(",") if o]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)

SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # the SPA reads this cookie to send X-CSRFToken

# ------------------------------------------------------------- Google OAuth

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback/"
)
GOOGLE_OAUTH_SCOPES = [
    s
    for s in os.getenv(
        "GOOGLE_OAUTH_SCOPES",
        " ".join(
            [
                "openid",
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
                "https://www.googleapis.com/auth/gmail.modify",
                "https://www.googleapis.com/auth/calendar.readonly",
            ]
        ),
    ).split()
]

# Gmail sync
GMAIL_SYNC_MAX_RESULTS = int(os.getenv("GMAIL_SYNC_MAX_RESULTS", "50"))

# ---------------------------------------------------------------- Anthropic

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")
# When false, classification falls back to deterministic heuristics. Lets the
# whole app run (and its tests pass) with no API key present.
LLM_ENABLED = env_bool("LLM_ENABLED", True)

# -------------------------------------------------------- Triage / schedule

SCHEDULE_DAY_START = float(os.getenv("SCHEDULE_DAY_START", "9"))
SCHEDULE_DAY_END = float(os.getenv("SCHEDULE_DAY_END", "18"))
SCHEDULE_MIN_GAP_MINUTES = int(os.getenv("SCHEDULE_MIN_GAP_MINUTES", "20"))
SCHEDULE_DEFAULT_BLOCK_MINUTES = int(os.getenv("SCHEDULE_DEFAULT_BLOCK_MINUTES", "30"))
DEFAULT_EFFORT_MINUTES = int(os.getenv("DEFAULT_EFFORT_MINUTES", "4"))

# Subscription analytics
DORMANT_WINDOW_DAYS = int(os.getenv("DORMANT_WINDOW_DAYS", "90"))
DORMANT_OPEN_THRESHOLD = int(os.getenv("DORMANT_OPEN_THRESHOLD", "2"))
BLACKLIST_HOLD_DAYS = int(os.getenv("BLACKLIST_HOLD_DAYS", "30"))
# Sending a mailto: unsubscribe requires working SMTP settings. Off by default
# so an unconfigured deployment never opens a stray connection.
UNSUBSCRIBE_EMAIL_ENABLED = env_bool("UNSUBSCRIBE_EMAIL_ENABLED", False)
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))

# Bulk send rate limiting
CAMPAIGN_BATCH_CAP = int(os.getenv("CAMPAIGN_BATCH_CAP", "20"))
CAMPAIGN_COOLDOWN_HOURS = int(os.getenv("CAMPAIGN_COOLDOWN_HOURS", "6"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}

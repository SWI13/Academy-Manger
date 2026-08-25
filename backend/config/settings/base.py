"""
Settings shared by every environment.

Nothing here reads a secret from a literal. Every value that differs between
development, staging and production comes from the environment, so the same
image runs in all three.
"""

from pathlib import Path

import environ
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

# Django is reached only through the Next.js BFF, which sets X-Forwarded-Host
# to the public site. Without this, every absolute URL Django builds - most
# visibly DRF's pagination `next` and `previous` - comes out as
# http://backend:8000/..., which both leaks the internal hostname to the
# browser and hands it a link it cannot follow.
#
# Trusting the header is safe precisely because of the topology: Django is not
# publicly routed, so nothing but the proxy can set it. ALLOWED_HOSTS is still
# checked against the forwarded value, so a spoofed host is refused rather
# than reflected.
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
]

# Domain apps. Each owns one slice of the platform; they talk to each other
# through service functions, never by reaching into each other's querysets.
LOCAL_APPS = [
    "apps.core",
    "apps.rbac",
    "apps.accounts",
    "apps.students",
    "apps.professors",
    "apps.courses",
    "apps.enrollments",
    "apps.schedules",
    "apps.assessments",
    "apps.payments",
    "apps.audit",
    "apps.notifications",
    "apps.reviews",
    "apps.reports",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# django.contrib.admin is deliberately absent. The platform's own owner
# dashboard is the administrative surface; a second, differently-authorized
# admin site would be a parallel access path that our permission model does
# not cover. It can be enabled in dev only if ever needed.

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "apps.audit.context.AuditContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
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

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST", default="postgres"),
        "PORT": env.int("POSTGRES_PORT", default=5432),
        "CONN_MAX_AGE": 60,
        "ATOMIC_REQUESTS": False,  # transactions are opened explicitly, per service
        "OPTIONS": {
            # Without this, a database that accepts the TCP connection but never
            # completes the handshake pins the worker until the OS gives up -
            # minutes, not seconds. Fail fast and let the health check report it.
            "connect_timeout": 5,
        },
    }
}

# ---------------------------------------------------------------------------
# Cache and sessions
#
# Sessions live in Redis rather than in JWTs so that deactivating a user takes
# effect on their next request. See architecture SS1, decision 3.
# ---------------------------------------------------------------------------
def _session_redis_url() -> str:
    """
    Default the session store to database 3 on the same Redis.

    db0 is the general cache, db1 and db2 belong to Celery. Derived by
    swapping the path rather than appending ?db=, which works but reads like
    an accident to whoever finds it next.
    """
    base_url = env("REDIS_URL")
    scheme, _, rest = base_url.partition("://")
    host, _, _tail = rest.partition("/")
    return f"{scheme}://{host}/3"


CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL"),
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    },
    # Sessions get their own Redis database, not the default cache.
    #
    # They were sharing one, and that makes `cache.clear()` a mass logout.
    # The default cache is a scratch space - the RBAC permission sets live
    # there and are meant to be discardable - so anything from a management
    # command to a future "clear the cache" button would sign the whole
    # institute out mid-transaction. Sessions are not scratch data; a
    # receptionist halfway through taking a payment should not be returned to
    # a login screen because someone invalidated a permission cache.
    "sessions": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_SESSION_URL", default=_session_redis_url()),
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    },
}

SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "sessions"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 12  # a working day
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
CSRF_COOKIE_HTTPONLY = False  # the BFF must read it to echo the header
CSRF_COOKIE_SAMESITE = "Lax"

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
# Set before the first migration is ever run. Swapping AUTH_USER_MODEL after
# tables exist is a manual data migration across every FK to auth.User, so the
# custom model ships in Phase 1 even though login lands in Phase 4.
AUTH_USER_MODEL = "accounts.User"

# Staff read User IDs aloud; students remember their phone. Both are unique,
# so either works as the login identifier.
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.PublicIdOrPhoneBackend"]

# Argon2 first: memory-hard, and the current OWASP recommendation. The
# remaining hashers stay listed so any legacy hash still verifies and is
# transparently upgraded on next login.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# REST framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    # Deny by default. Every endpoint opts in to who may reach it; a viewset
    # that forgets its permission_classes is closed, not open.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ],
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/min",
        "user": "1000/hour",
        "login": "10/min",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SM Academy API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # RoleCode appears on User.primary_role and in the role-assignment body.
    # Naming the enum once keeps the generated TypeScript to a single type
    # instead of PrimaryRoleEnum and RoleEnum that happen to be identical.
    "ENUM_NAME_OVERRIDES": {
        "RoleCodeEnum": "apps.core.enums.RoleCode.choices",
        "UserStatusEnum": "apps.core.enums.UserStatus.choices",
        "WilayaEnum": "apps.core.wilayas.Wilaya.choices",
        "PriorLevelEnum": "apps.students.models.PriorLevel.choices",
        # Four models have a "status" field with different choice sets.
        # Unnamed, drf-spectacular invents CourseStatus9c9Enum and friends,
        # which become unreadable TypeScript type names.
        "CourseStatusEnum": "apps.courses.models.CourseStatus.choices",
        "EnrollmentStatusEnum": "apps.enrollments.models.EnrollmentStatus.choices",
        "ScheduleStatusEnum": "apps.schedules.models.ScheduleStatus.choices",
        "AssignmentStatusEnum": "apps.courses.models.AssignmentStatus.choices",
        "AssignmentRoleEnum": "apps.courses.models.AssignmentRole.choices",
        "AssessmentKindEnum": "apps.assessments.models.AssessmentKind.choices",
        "PaymentStatusEnum": "apps.payments.models.PaymentStatus.choices",
        "PaymentMethodEnum": "apps.payments.models.PaymentMethod.choices",
        "ScanStatusEnum": "apps.payments.models.ScanStatus.choices",
        "AuditActionEnum": "apps.audit.models.AuditAction.choices",
        "NotificationKindEnum": "apps.notifications.models.NotificationKind.choices",
        "ChannelEnum": "apps.notifications.models.Channel.choices",
        "DeliveryStatusEnum": "apps.notifications.models.DeliveryStatus.choices",
        "ReviewStatusEnum": "apps.reviews.models.ReviewStatus.choices",
        "ExportStatusEnum": "apps.reports.models.ExportStatus.choices",
    },
}

# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------
S3_ENDPOINT_URL = env("S3_ENDPOINT_URL")

# Where the *browser* reaches object storage, which is not where Django does.
#
# A presigned URL is signed over the host it names, so this cannot be a
# rewrite after the fact - the signature would no longer match. Django talks
# to http://minio:9000 on the internal network; the browser follows a link
# signed for the public endpoint. In development those are the same MinIO on
# two different names, and in production this is the CDN or public bucket
# hostname.
S3_PUBLIC_ENDPOINT_URL = env("S3_PUBLIC_ENDPOINT_URL", default=env("S3_ENDPOINT_URL"))
S3_ACCESS_KEY = env("S3_ACCESS_KEY")
S3_SECRET_KEY = env("S3_SECRET_KEY")
S3_BUCKET_NAME = env("S3_BUCKET_NAME")
S3_REGION = env("S3_REGION", default="us-east-1")
S3_UPLOAD_URL_TTL = env.int("S3_UPLOAD_URL_TTL", default=300)
S3_DOWNLOAD_URL_TTL = env.int("S3_DOWNLOAD_URL_TTL", default=60)

# ---------------------------------------------------------------------------
# Celery
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = env("CELERY_BROKER_URL")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND")
CELERY_TASK_ACKS_LATE = True  # a worker that dies re-queues its job
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = 60 * 10
CELERY_TASK_SOFT_TIME_LIMIT = 60 * 9
CELERY_TIMEZONE = "UTC"

# Beat schedule. Both tasks are idempotent - beat can fire twice after a
# restart, and a duplicate reminder is what gets notifications muted.
CELERY_BEAT_SCHEDULE = {
    "session-reminders": {
        "task": "notifications.send_session_reminders",
        "schedule": crontab(hour=18, minute=0),  # the evening before
    },
    "roster-digests": {
        "task": "notifications.send_roster_digests",
        "schedule": crontab(hour=7, minute=30),
    },
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# Only the Next.js origin. Django is not publicly routed (architecture SS1),
# so this list should never need a second entry in production.
CORS_ALLOWED_ORIGINS = [env("PUBLIC_SITE_URL", default="http://localhost:3000")]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [env("PUBLIC_SITE_URL", default="http://localhost:3000")]

# ---------------------------------------------------------------------------
# i18n / static
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# ---------------------------------------------------------------------------
# Domain
# ---------------------------------------------------------------------------
# All money is stored as integer minor units plus this code. Never a float.
DEFAULT_CURRENCY = env("DEFAULT_CURRENCY", default="DZD")

# Region assumed when staff type a local phone number ("0555123456").
# Numbers are always stored in E.164 so an SMS gateway can dial them.
DEFAULT_PHONE_REGION = env("DEFAULT_PHONE_REGION", default="DZ")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "{levelname} {asctime} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.db.backends": {"level": "WARNING", "handlers": ["console"], "propagate": False},
    },
}

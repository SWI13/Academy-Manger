# Python 3.13, not 3.14: Django 5.2 LTS supports 3.10-3.13, and several
# stack dependencies (Celery, psycopg) do not yet ship 3.14 wheels.
# Pinning here is exactly why the container is the source of truth for the
# runtime rather than whatever Python happens to be on a developer machine.
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# libpq for psycopg, build-essential only while installing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/ /app/requirements/


FROM base AS dev
RUN pip install -r requirements/dev.txt
COPY . /app


FROM base AS prod
RUN pip install -r requirements/prod.txt
COPY . /app
# Web and worker run the same image with different commands, so the code
# that validates a payment in a request is the code that validates it in a task.
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]

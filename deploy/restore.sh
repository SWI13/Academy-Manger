#!/usr/bin/env bash
#
# Restore a backup taken by backup.sh.
#
#   ./deploy/restore.sh backups/20260825T020000Z
#
# This exists so that rehearsing a restore is one command. A backup nobody has
# restored is a hope: the failure modes - a dump taken with the wrong flags, a
# bucket that was empty, a checksum nobody verified - are all silent until the
# day they are not.
#
# It stops the application first and restarts it after. That is deliberate: a
# restore with gunicorn still serving would have requests reading a database
# mid-rewrite.

set -euo pipefail

cd "$(dirname "$0")/.."

DIR="${1:-}"
if [[ -z "${DIR}" || ! -d "${DIR}" ]]; then
    echo "usage: $0 backups/<timestamp>" >&2
    echo >&2
    ls -1 backups 2>/dev/null | tail -5 >&2 || true
    exit 2
fi

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

# shellcheck disable=SC1091
set -a; . ./.env.prod; set +a

echo "==> Manifest"
cat "${DIR}/manifest.txt"

echo "==> Verifying checksums"
( cd "${DIR}" && sha256sum --check SHA256SUMS )

cat <<EOF

This will REPLACE the contents of database '${POSTGRES_DB}' and bucket
'${S3_BUCKET_NAME}' with the backup above. Everything recorded since it was
taken will be gone.

EOF
read -r -p "Type the database name to continue: " confirm
[[ "${confirm}" == "${POSTGRES_DB}" ]] || { echo "Not confirmed. Nothing changed."; exit 1; }

echo "==> Stopping the application (database and storage stay up)"
$COMPOSE stop backend worker beat frontend

echo "==> Database"
# --clean --if-exists was baked into the dump, so this drops and recreates as
# it goes. --single-transaction so a failure leaves the old data rather than
# half the new.
$COMPOSE exec -T postgres pg_restore \
    --username "${POSTGRES_USER}" \
    --dbname "${POSTGRES_DB}" \
    --clean --if-exists \
    --single-transaction \
    --no-owner \
    < "${DIR}/database.dump"

echo "==> Object storage"
rm -rf "${DIR:?}/bucket"
tar -C "${DIR}" -xzf "${DIR}/storage.tar.gz"
# --remove so a file deleted since the backup does not survive the restore.
# A bucket that is a superset of the backup is not the backup.
MSYS_NO_PATHCONV=1 $COMPOSE run --rm     -v "${PWD}/${DIR}:/backup"     --entrypoint sh minio-init -c "
        mc alias set local http://minio:9000 '${S3_ACCESS_KEY}' '${S3_SECRET_KEY}' >/dev/null &&
        mc mirror --quiet --overwrite --remove /backup/bucket local/${S3_BUCKET_NAME}
    "
rm -rf "${DIR:?}/bucket"

echo "==> Applying any migrations newer than the dump"
# The code may be ahead of the data - restoring last night's database under
# this morning's deploy is a normal situation, not an error.
$COMPOSE run --rm backend python manage.py migrate

echo "==> Starting the application"
$COMPOSE start backend worker beat frontend

echo "==> Health"
sleep 5
$COMPOSE exec -T backend curl -fsS http://localhost:8000/api/v1/health/ && echo

cat <<'EOF'

Restored. Check before telling anyone it is done:

  - Sign in. Sessions live in Redis, which is NOT part of this backup, so
    everyone is signed out. That is correct, not a fault.
  - Open a payment with a proof and download it. That is the one check that
    exercises the database and the bucket together, which is the pairing this
    restore had to get right.
EOF

#!/usr/bin/env bash
#
# Nightly backup: the database, and the object store beside it.
#
# Both, because either alone is useless. The database holds a storage key for
# every payment proof; the bucket holds bytes nothing references. Restoring
# one without the other gives you either a ledger full of broken links or a
# pile of anonymous scans.
#
#   ./deploy/backup.sh
#   0 2 * * *  cd /srv/sm-academy && ./deploy/backup.sh >> /var/log/sm-backup.log 2>&1
#
# A backup nobody has restored is a hope, not a backup. `restore.sh` exists so
# that rehearsing it is one command, and the runbook says to do it quarterly.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="backups/${STAMP}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

# shellcheck disable=SC1091
set -a; . ./.env.prod; set +a

mkdir -p "${DIR}"

echo "==> Database"
# --clean --if-exists so the dump can be restored over an existing database
# without hand-editing it first, which is exactly the moment nobody wants to
# be hand-editing anything.
$COMPOSE exec -T postgres pg_dump \
    --username "${POSTGRES_USER}" \
    --dbname "${POSTGRES_DB}" \
    --format=custom \
    --clean --if-exists \
    > "${DIR}/database.dump"

echo "==> Object storage"
# Mirrored out through the mc client rather than archived inside the MinIO
# container: that image carries no tar, and depending on what happens to be
# installed in a server image is how a backup script breaks silently.
# Created up front: mc mirror makes no directory for an empty bucket, and a
# new institute with no payment proofs yet must not have its backup fail on
# the one night it has nothing to store.
mkdir -p "${DIR}/bucket"
MSYS_NO_PATHCONV=1 $COMPOSE run --rm     -v "${PWD}/${DIR}:/backup"     --entrypoint sh minio-init -c "
        mc alias set local http://minio:9000 '${S3_ACCESS_KEY}' '${S3_SECRET_KEY}' >/dev/null &&
        mc mirror --quiet --overwrite local/${S3_BUCKET_NAME} /backup/bucket
    "
# Archived on the host, where tar is a given.
tar -C "${DIR}" -czf "${DIR}/storage.tar.gz" bucket
rm -rf "${DIR:?}/bucket"

# What produced this, so a restore three months from now is not guesswork.
cat > "${DIR}/manifest.txt" <<EOF
taken_at   ${STAMP}
git_commit $(git rev-parse HEAD 2>/dev/null || echo unknown)
database   ${POSTGRES_DB}
bucket     ${S3_BUCKET_NAME}
EOF

# Checksums, so a truncated transfer is caught before the restore rather than
# during it.
( cd "${DIR}" && sha256sum ./* > SHA256SUMS )

echo "==> Kept in ${DIR}"
du -sh "${DIR}"

echo "==> Pruning backups older than ${KEEP_DAYS} days"
find backups -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -print -exec rm -rf {} +

cat <<'EOF'

Done. Two things this script does NOT do, deliberately:

  It does not copy the backup off this machine. A backup on the same disk as
  the database survives a bad migration and nothing else. Send `backups/` to
  storage on another machine - that step belongs to whoever owns the server,
  not to a script in the repo that would need those credentials.

  It does not back up .env.prod. Secrets do not belong in a tarball beside the
  data they protect. Keep them in whatever the institute uses for secrets, and
  write down where.
EOF

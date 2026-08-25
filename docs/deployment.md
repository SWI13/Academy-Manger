# Deployment

One machine, Docker Compose, Nginx in front. No orchestrator: this is one
institute, and a Kubernetes cluster to run six containers is a second system
to operate.

## What is exposed

**Only Nginx publishes a port.** Verified by stopping the development stack
and asking, from outside the network:

| Port | | |
| --- | --- | --- |
| 80 | Nginx | 301 to https |
| 443 | Nginx | 200 |
| 8000 | Django | refused |
| 3000 | Next | refused |
| 5432 | PostgreSQL | refused |
| 6379 | Redis | refused |
| 9000/9001 | MinIO | refused |

"Django is not routed publicly" stops being a convention here and becomes a
fact about the network: the container publishes no port, and Nginx has no
location block that names it.

## First deploy

```bash
git clone <repo> /srv/sm-academy && cd /srv/sm-academy

cp .env.prod.example .env.prod
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # DJANGO_SECRET_KEY
# Fill in every blank. MINIO_ROOT_USER/PASSWORD must equal S3_ACCESS_KEY/SECRET,
# and MinIO refuses to start with a user under 3 or a password under 8 chars.

# TLS. Real certificates, not the self-signed pair used to test the stack.
certbot certonly --webroot -w /var/www/certbot -d academy.example.com
cp /etc/letsencrypt/live/academy.example.com/{fullchain,privkey}.pem deploy/certs/

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
    python manage.py migrate

# The first owner. There is no public registration and no other way in.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
    python manage.py shell
```

```python
from apps.rbac.models import Role
from apps.rbac.services import assign_role
from django.contrib.auth import get_user_model

owner = get_user_model().objects.create_user(
    first_name="...", last_name="...", primary_role="OWNER",
    phone="+213...", password="...",
)
assign_role(owner, Role.objects.get(code="OWNER"))
print(owner.public_id)   # this is the sign-in ID
```

### `--env-file .env.prod`, every time

Not optional, and the reason is worth knowing. Compose reads two different
files for two different things: `${VAR}` substitution comes from `.env` in the
project directory, while `env_file:` is what the container receives.

Without the flag, a production `up` substitutes **development** values. The
first time this stack was started, PostgreSQL was initialised with the
development password and nothing complained until `migrate` failed on
authentication — by which point the volume existed and had to be destroyed.

The services that hold credentials now take `env_file: .env.prod` and
substitute nothing, so that particular failure cannot recur. The flag is still
required for `GUNICORN_WORKERS` and is in every command here.

## Routine operations

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"

$C ps                             # what is running
$C logs -f backend                # application logs
$C exec backend python manage.py migrate
$C up -d --build                  # deploy a new version
$C restart backend worker beat    # after a config change
```

Deploying restarts gunicorn, which does **not** sign anyone out: sessions live
in Redis on its own database with `appendonly yes`. Restarting *Redis* does
sign everyone out, so do it deliberately.

## Backups

```bash
./deploy/backup.sh                       # database + bucket
./deploy/restore.sh backups/20260825T020000Z
```

Nightly:

```cron
0 2 * * * cd /srv/sm-academy && ./deploy/backup.sh >> /var/log/sm-backup.log 2>&1
```

Both halves are taken together because either alone is useless: the database
holds a storage key for every payment proof, and the bucket holds bytes
nothing references. Restore one without the other and you have a ledger full
of broken links or a pile of anonymous scans.

Two things the script deliberately does not do:

- **It does not copy backups off the machine.** A backup on the same disk as
  the database survives a bad migration and nothing else. Shipping `backups/`
  elsewhere belongs to whoever owns the server, not to a script in the repo
  that would need those credentials.
- **It does not back up `.env.prod`.** Secrets do not belong in a tarball
  beside the data they protect.

**Rehearse the restore quarterly.** A backup nobody has restored is a hope —
every failure mode (wrong dump flags, an empty bucket, an unverified checksum)
is silent until the day it is not. `restore.sh` verifies checksums, refuses to
run without the database name typed back, and finishes by telling you to open
a payment proof: that is the one check exercising the database and the bucket
together, which is the pairing the restore had to get right.

## Certificate renewal

```cron
0 3 * * 1 certbot renew --webroot -w /var/www/certbot --quiet && \
  cp /etc/letsencrypt/live/academy.example.com/{fullchain,privkey}.pem \
     /srv/sm-academy/deploy/certs/ && \
  cd /srv/sm-academy && docker compose -f docker-compose.prod.yml \
     --env-file .env.prod exec nginx nginx -s reload
```

Port 80 stays open for the ACME challenge and redirects everything else.

## Things that bite

**`add_header` in Nginx does not inherit — it replaces.** A single
`add_header` inside a `location` drops *every* header set at server level. The
first version of `nginx.conf` set the security headers on the server block and
`Cache-Control` in `location /`, and HSTS silently vanished from every
response. The headers now live in `deploy/security-headers.conf` and are
`include`d in each location. If you add a location, include it there too.

**The container healthcheck needs two headers, and neither is obvious.** A
plain `curl http://localhost:8000/api/v1/health/` inside the backend container
fails twice over in production: `localhost` is not in `ALLOWED_HOSTS`, so
Django answers **400 DisallowedHost**; and with the correct `Host` it answers
**301**, because `SECURE_SSL_REDIRECT` is on and an internal request arrives
over plain HTTP. `curl -f` treats both as failure, so the container sits
unhealthy forever and anything waiting on `service_healthy` never starts. The
healthcheck now sends `Host: localhost` and `X-Forwarded-Proto: https`, and
`localhost` is in `ALLOWED_HOSTS` for exactly that call.

**Two S3 endpoints, and they are not interchangeable.** Django reaches storage
at `http://minio:9000`; the browser follows a presigned URL signed over
`S3_PUBLIC_ENDPOINT_URL`. SigV4 covers the host header, so a signed URL cannot
be rewritten afterwards — get it right before signing or the signature is
invalid. In this stack the public value is `https://<host>/storage`, which
Nginx proxies to MinIO without buffering.

**`DJANGO_ALLOWED_HOSTS` must be the real hostname, never `*`.** Django
honours `X-Forwarded-Host` so its absolute URLs name the public site, and the
host check is the thing that keeps that safe.

## Health

```bash
curl https://academy.example.com/api/v1/health
```

`{"status":"ok","database":"ok","cache":"ok"}`. The backend container has the
same call as its healthcheck, so a database that goes away marks the container
unhealthy rather than failing quietly per-request.

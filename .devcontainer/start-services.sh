#!/usr/bin/env bash
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
POSTGRES_DB="${POSTGRES_DB:-traefik_share}"
POSTGRES_USER="${POSTGRES_USER:-admin}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"
WORKSPACE_FOLDER="${WORKSPACE_FOLDER:-/workspaces/workspace}"
POSTGRES_RUN_USER="${POSTGRES_RUN_USER:-postgres}"

PG_BIN_DIR=""
if command -v pg_config >/dev/null 2>&1; then
  PG_BIN_DIR="$(pg_config --bindir)"
fi
if [ -n "${PG_BIN_DIR}" ] && [ -d "${PG_BIN_DIR}" ]; then
  export PATH="${PG_BIN_DIR}:${PATH}"
fi

initdb_bin="${PG_BIN_DIR:+${PG_BIN_DIR}/}initdb"
pg_ctl_bin="${PG_BIN_DIR:+${PG_BIN_DIR}/}pg_ctl"
psql_bin="${PG_BIN_DIR:+${PG_BIN_DIR}/}psql"
pg_isready_bin="${PG_BIN_DIR:+${PG_BIN_DIR}/}pg_isready"

if ! command -v "${initdb_bin}" >/dev/null 2>&1; then
  echo "PostgreSQL initdb not found. Ensure the postgresql package is installed in the devcontainer." >&2
  exit 127
fi

install -d -m 0700 -o "${POSTGRES_RUN_USER}" -g "${POSTGRES_RUN_USER}" "${PGDATA}"
chown -R "${POSTGRES_RUN_USER}:${POSTGRES_RUN_USER}" "${PGDATA}"
chmod 0700 "${PGDATA}"

if [ ! -s "${PGDATA}/PG_VERSION" ]; then
  su "${POSTGRES_RUN_USER}" -c "${initdb_bin} -D '${PGDATA}'"
  echo "listen_addresses='*'" >> "${PGDATA}/postgresql.conf"
  echo "host all all 0.0.0.0/0 md5" >> "${PGDATA}/pg_hba.conf"
  su "${POSTGRES_RUN_USER}" -c "${pg_ctl_bin} -D '${PGDATA}' -o \"-p 5432\" -w start"
  cat <<SQL | su "${POSTGRES_RUN_USER}" -c "${psql_bin} -v ON_ERROR_STOP=1 --username=postgres"
CREATE USER "${POSTGRES_USER}" WITH PASSWORD '${POSTGRES_PASSWORD}';
CREATE DATABASE "${POSTGRES_DB}" OWNER "${POSTGRES_USER}";
SQL
  su "${POSTGRES_RUN_USER}" -c "${pg_ctl_bin} -D '${PGDATA}' -m fast -w stop"
fi

if ! "${pg_isready_bin}" -h localhost -p 5432 -q; then
  if [ -f "${PGDATA}/postmaster.pid" ] && ! su "${POSTGRES_RUN_USER}" -c "${pg_ctl_bin} -D '${PGDATA}' status" >/dev/null 2>&1; then
    rm -f "${PGDATA}/postmaster.pid"
  fi
  su "${POSTGRES_RUN_USER}" -c "${pg_ctl_bin} -D '${PGDATA}' -o \"-p 5432\" -w start"
fi

db_marker="${PGDATA}/.db_initialized"
if [ ! -f "${db_marker}" ]; then
  if command -v pnpm >/dev/null 2>&1 && [ -f "${WORKSPACE_FOLDER}/package.json" ]; then
    (cd "${WORKSPACE_FOLDER}" && pnpm db:generate) || true
    (cd "${WORKSPACE_FOLDER}" && pnpm db:push) || true
    touch "${db_marker}"
  fi
fi

if ! pgrep -x traefik >/dev/null 2>&1; then
  nohup traefik \
    --log.level=DEBUG \
    --api.insecure=true \
    --entrypoints.web.address=:8081 \
    --providers.http.endpoint="http://localhost:3000/api/traefik/config" \
    --providers.http.pollInterval=10s \
    >/var/log/traefik.log 2>&1 &
fi

cat <<'EOF'
Dev services are available at:
- App: http://localhost:3000
- Traefik dashboard: http://localhost:8080
- Traefik web entrypoint: http://localhost:8081

Common commands:
- pnpm dev (start dev server)
- pnpm lint (run ESLint)
- pnpm build (production build)
- pnpm test (run unit tests)
- pnpm test:e2e (run Playwright tests)
- pnpm db:generate (generate migrations)
- pnpm db:push (apply schema changes)
- pnpm up --latest (update dependencies)
- pnpm verify (run all checks: lint, test, build)
EOF

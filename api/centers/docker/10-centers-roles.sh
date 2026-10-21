#!/bin/sh
# The official entrypoint sources this file once, on an empty volume. No credentials in SQL logs.
set -eu
if [ "$CENTERS_APP_PASSWORD" = "$CENTERS_MIGRATOR_PASSWORD" ] || \
   [ "$CENTERS_APP_PASSWORD" = "$POSTGRES_PASSWORD" ] || \
   [ "$CENTERS_MIGRATOR_PASSWORD" = "$POSTGRES_PASSWORD" ]; then
  echo "Centers bootstrap requires three different passwords" >&2
  exit 1
fi
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc --set ON_ERROR_STOP=1 \
  --set db_name="$POSTGRES_DB" --set app_password="$CENTERS_APP_PASSWORD" \
  --set migrator_password="$CENTERS_MIGRATOR_PASSWORD" <<'SQL'
CREATE ROLE centers_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
CREATE ROLE centers_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE :"db_name" TO centers_migrator;
GRANT CONNECT ON DATABASE :"db_name" TO centers_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA centers AUTHORIZATION centers_migrator;
REVOKE ALL ON SCHEMA centers FROM PUBLIC;
GRANT USAGE ON SCHEMA centers TO centers_app;
SQL

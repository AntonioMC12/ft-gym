-- No business data yet. The migrator owns objects; the runtime can only read metadata.
REVOKE ALL ON SCHEMA centers FROM PUBLIC;
GRANT USAGE ON SCHEMA centers TO centers_app;
GRANT SELECT ON centers.schema_migrations TO centers_app;

CREATE TABLE centers.environment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  kind text NOT NULL CHECK (kind IN ('development', 'test', 'production'))
);
REVOKE ALL ON centers.environment FROM PUBLIC;
GRANT SELECT ON centers.environment TO centers_app;

-- Tables of subsequent migrations opt in explicitly; never grant every table by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA centers REVOKE ALL ON TABLES FROM PUBLIC;

CREATE TABLE centers.centers (
  id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  tax_id text, address text, contact_email text, phone text,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'inactive')),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  policy jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(policy) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE centers.role_assignments (
  id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL REFERENCES centers.centers(id),
  account_uid text NOT NULL CHECK (length(account_uid) BETWEEN 1 AND 128),
  role text NOT NULL CHECK (role IN ('manager', 'trainer')),
  extra_capabilities text[] NOT NULL DEFAULT '{}' CHECK (extra_capabilities <@ ARRAY['data.export', 'payments.refund']),
  valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz, revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (center_id, id), CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE UNIQUE INDEX role_active_unique ON centers.role_assignments(center_id, account_uid, role) WHERE revoked_at IS NULL;
CREATE INDEX role_lookup ON centers.role_assignments(account_uid, center_id);

CREATE TABLE centers.members (
  id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  center_id text NOT NULL REFERENCES centers.centers(id), account_uid text,
  member_number text NOT NULL CHECK (length(member_number) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120), email text, phone text, national_document text,
  email_key text GENERATED ALWAYS AS (nullif(lower(btrim(email)), '')) STORED,
  document_key text GENERATED ALWAYS AS (nullif(upper(regexp_replace(national_document, '[[:space:]-]', '', 'g')), '')) STORED,
  state text NOT NULL DEFAULT 'preactive' CHECK (state IN ('preactive', 'active', 'frozen', 'ended')),
  joined_on date NOT NULL DEFAULT CURRENT_DATE, ends_on date, end_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(center_id, id), UNIQUE(center_id, member_number), UNIQUE(center_id, email_key), UNIQUE(center_id, document_key),
  UNIQUE(center_id, account_uid), CHECK (ends_on IS NULL OR ends_on >= joined_on)
);
CREATE INDEX member_lookup ON centers.members(center_id, state, name);
CREATE INDEX member_account ON centers.members(account_uid);

CREATE TABLE centers.consents (
  id text PRIMARY KEY, center_id text NOT NULL, member_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('terms', 'marketing', 'training_share', 'sepa')),
  text_version text NOT NULL, granted_at timestamptz NOT NULL, revoked_at timestamptz, source text NOT NULL,
  FOREIGN KEY(center_id, member_id) REFERENCES centers.members(center_id, id),
  CHECK(revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE TABLE centers.business_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, center_id text NOT NULL REFERENCES centers.centers(id),
  actor_uid text NOT NULL, action text NOT NULL, target_id text, details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(jsonb_typeof(details) = 'object')
);
CREATE INDEX audit_center_time ON centers.business_audit(center_id, created_at);
CREATE TABLE centers.idempotency_records (
  center_id text NOT NULL REFERENCES centers.centers(id), actor_uid text NOT NULL,
  operation text NOT NULL, request_id text NOT NULL, body_hash text NOT NULL CHECK (body_hash ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(center_id, actor_uid, operation, request_id)
);

-- Minimal identity metadata: triggers maintain references in the same SQL transaction.
-- Like roles, this table deliberately permits its trusted owner to bypass RLS for the
-- narrow read-only identity lookup functions. The API role is never the table owner.
CREATE TABLE centers.account_references (
  center_id text NOT NULL REFERENCES centers.centers(id), account_uid text NOT NULL,
  source text NOT NULL CHECK (source IN ('role', 'member')), record_id text NOT NULL,
  PRIMARY KEY(source, record_id)
);
CREATE INDEX reference_account ON centers.account_references(account_uid);

CREATE FUNCTION centers.actor_uid() RETURNS text LANGUAGE sql STABLE
  SET search_path = pg_catalog AS $$ SELECT nullif(current_setting('centers.uid', true), '') $$;
CREATE FUNCTION centers.selected_center() RETURNS text LANGUAGE sql STABLE
  SET search_path = pg_catalog AS $$ SELECT nullif(current_setting('centers.center_id', true), '') $$;
CREATE FUNCTION centers.is_platform() RETURNS boolean LANGUAGE sql STABLE
  SET search_path = pg_catalog AS $$ SELECT coalesce(current_setting('centers.platform', true) = '1', false) $$;

-- SECURITY DEFINER is required solely for non-recursive access to permission metadata.
-- Fully qualified objects, locked search_path and explicit EXECUTE grants prevent hijacking.
CREATE FUNCTION centers.has_role(target_center text, roles text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM centers.role_assignments r
    WHERE r.center_id = target_center AND r.account_uid = centers.actor_uid() AND r.role = ANY(roles)
      AND r.revoked_at IS NULL AND r.valid_from <= CURRENT_TIMESTAMP
      AND (r.valid_until IS NULL OR r.valid_until > CURRENT_TIMESTAMP))
$$;

CREATE FUNCTION centers.lock_my_roles(target_center text) RETURNS SETOF text LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog AS $$
  SELECT r.id FROM centers.role_assignments r WHERE r.center_id = target_center
    AND r.account_uid = centers.actor_uid() AND r.revoked_at IS NULL
    AND r.valid_from <= CURRENT_TIMESTAMP AND (r.valid_until IS NULL OR r.valid_until > CURRENT_TIMESTAMP)
    FOR SHARE
$$;

ALTER TABLE centers.role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_read ON centers.role_assignments FOR SELECT TO centers_app USING (
  centers.is_platform() OR account_uid = centers.actor_uid() OR
  (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']))
);
CREATE POLICY roles_insert ON centers.role_assignments FOR INSERT TO centers_app WITH CHECK (centers.is_platform());
CREATE POLICY roles_update ON centers.role_assignments FOR UPDATE TO centers_app
  USING(centers.is_platform()) WITH CHECK(centers.is_platform());

ALTER TABLE centers.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.members FORCE ROW LEVEL SECURITY;
CREATE POLICY members_read ON centers.members FOR SELECT TO centers_app USING (
  centers.is_platform() OR account_uid = centers.actor_uid() OR
  (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager','trainer']))
);
CREATE POLICY members_write ON centers.members FOR INSERT TO centers_app WITH CHECK (
  centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']))
);
CREATE POLICY members_update ON centers.members FOR UPDATE TO centers_app USING (
  centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']))
) WITH CHECK (centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager'])));

ALTER TABLE centers.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.centers FORCE ROW LEVEL SECURITY;
CREATE POLICY center_read ON centers.centers FOR SELECT TO centers_app USING (
  centers.is_platform() OR centers.has_role(id, ARRAY['manager','trainer']) OR
  EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id = centers.centers.id AND m.account_uid = centers.actor_uid())
);
CREATE POLICY center_insert ON centers.centers FOR INSERT TO centers_app WITH CHECK(centers.is_platform());
CREATE POLICY center_update ON centers.centers FOR UPDATE TO centers_app USING (
  centers.is_platform() OR (id = centers.selected_center() AND centers.has_role(id, ARRAY['manager']))
) WITH CHECK (centers.is_platform() OR (id = centers.selected_center() AND centers.has_role(id, ARRAY['manager'])));

ALTER TABLE centers.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.consents FORCE ROW LEVEL SECURITY;
CREATE POLICY consent_read ON centers.consents FOR SELECT TO centers_app USING (
  centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager'])) OR
  EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id = consents.center_id AND m.id = consents.member_id AND m.account_uid = centers.actor_uid())
);
CREATE POLICY consent_insert ON centers.consents FOR INSERT TO centers_app WITH CHECK (
  centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']))
);
CREATE POLICY consent_update ON centers.consents FOR UPDATE TO centers_app
  USING (centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager'])))
  WITH CHECK (centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager'])));

ALTER TABLE centers.business_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.business_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON centers.business_audit FOR SELECT TO centers_app USING (
  centers.is_platform() OR (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager']))
);
CREATE POLICY audit_insert ON centers.business_audit FOR INSERT TO centers_app WITH CHECK (
  actor_uid = centers.actor_uid() AND (centers.is_platform() OR
    (center_id = centers.selected_center() AND centers.has_role(center_id, ARRAY['manager','trainer'])))
);

ALTER TABLE centers.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY request_read ON centers.idempotency_records FOR SELECT TO centers_app
  USING(center_id = centers.selected_center() AND actor_uid = centers.actor_uid());
CREATE POLICY request_insert ON centers.idempotency_records FOR INSERT TO centers_app
  WITH CHECK(center_id = centers.selected_center() AND actor_uid = centers.actor_uid());

ALTER TABLE centers.account_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY reference_read ON centers.account_references FOR SELECT TO centers_app
  USING(centers.is_platform() OR account_uid = centers.actor_uid());
CREATE FUNCTION centers.track_account_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    DELETE FROM centers.account_references WHERE source = TG_ARGV[0] AND record_id = OLD.id;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.account_uid IS NOT NULL THEN
    INSERT INTO centers.account_references(center_id,account_uid,source,record_id)
      VALUES(NEW.center_id,NEW.account_uid,TG_ARGV[0],NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER role_reference AFTER INSERT OR UPDATE OR DELETE ON centers.role_assignments
  FOR EACH ROW EXECUTE FUNCTION centers.track_account_reference('role');
CREATE TRIGGER member_reference AFTER INSERT OR UPDATE OR DELETE ON centers.members
  FOR EACH ROW EXECUTE FUNCTION centers.track_account_reference('member');
CREATE FUNCTION centers.has_account_references(target_uid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM centers.account_references WHERE account_uid = target_uid) $$;

REVOKE ALL ON ALL TABLES IN SCHEMA centers FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA centers FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON centers.centers, centers.role_assignments, centers.members, centers.consents TO centers_app;
GRANT SELECT, INSERT ON centers.business_audit, centers.idempotency_records TO centers_app;
GRANT SELECT ON centers.account_references TO centers_app;
GRANT USAGE ON SEQUENCE centers.business_audit_id_seq TO centers_app;
GRANT EXECUTE ON FUNCTION centers.actor_uid(), centers.selected_center(), centers.is_platform(),
  centers.has_role(text,text[]), centers.lock_my_roles(text), centers.has_account_references(text) TO centers_app;

-- Bounded, actor-owned CSV reviews. No accounts, balances or contracts imported.
CREATE TABLE centers.member_import_jobs(
  id text PRIMARY KEY CHECK(id ~ '^mi_[a-f0-9]{32}$'),
  center_id text NOT NULL REFERENCES centers.centers(id),actor_uid text NOT NULL,
  request_id text NOT NULL CHECK(request_id ~ '^[a-zA-Z0-9_-]{8,128}$'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','completed')),
  records jsonb CHECK(records IS NULL OR jsonb_typeof(records)='array' AND jsonb_array_length(records) BETWEEN 1 AND 200),
  result jsonb CHECK(result IS NULL OR jsonb_typeof(result)='object'),
  review_hash text CHECK(review_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT statement_timestamp()+interval '24 hours',completed_at timestamptz,
  UNIQUE(center_id,id),UNIQUE(center_id,actor_uid,request_id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours'),
  CHECK(state='prepared' AND records IS NOT NULL AND result IS NULL AND review_hash IS NULL AND completed_at IS NULL
    OR state='completed' AND records IS NULL AND result IS NOT NULL AND review_hash IS NOT NULL AND completed_at IS NOT NULL)
);
CREATE INDEX member_import_actor ON centers.member_import_jobs(center_id,actor_uid,created_at DESC);
ALTER TABLE centers.member_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.member_import_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY member_import_read ON centers.member_import_jobs FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY member_import_insert ON centers.member_import_jobs FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND state='prepared'
  AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY member_import_update ON centers.member_import_jobs FOR UPDATE TO centers_app USING(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])))
  WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE FUNCTION centers.check_member_import_completion() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF OLD.state<>'prepared' OR NEW.state<>'completed' OR OLD.expires_at<=clock_timestamp() OR NEW.records IS NOT NULL
    OR NEW.result IS NULL OR NEW.review_hash IS NULL THEN RAISE EXCEPTION 'invalid member import transition' USING ERRCODE='23514'; END IF;
  NEW.completed_at=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER check_member_import_completion BEFORE UPDATE ON centers.member_import_jobs FOR EACH ROW EXECUTE FUNCTION centers.check_member_import_completion();
GRANT SELECT ON centers.member_import_jobs TO centers_app;
GRANT INSERT(id,center_id,actor_uid,request_id,input_hash,records) ON centers.member_import_jobs TO centers_app;
GRANT UPDATE(state,records,result,review_hash,completed_at) ON centers.member_import_jobs TO centers_app;

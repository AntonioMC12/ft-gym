-- Opt-in self-service requests; lifecycle/billing remain in the existing ledger.
CREATE TABLE centers.freeze_policies(
  center_id text PRIMARY KEY REFERENCES centers.centers(id),
  config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  actor_uid text NOT NULL,updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE centers.freeze_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.freeze_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY freeze_policy_read ON centers.freeze_policies FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])
    OR EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=freeze_policies.center_id AND m.account_uid=centers.actor_uid())));
CREATE POLICY freeze_policy_insert ON centers.freeze_policies FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY freeze_policy_update ON centers.freeze_policies FOR UPDATE TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])))
  WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
GRANT SELECT,INSERT ON centers.freeze_policies TO centers_app;
GRANT UPDATE(config,version,actor_uid,updated_at) ON centers.freeze_policies TO centers_app;

CREATE TABLE centers.freeze_requests(
  id text PRIMARY KEY CHECK(id ~ '^fr_[a-f0-9]{32}$'),
  center_id text NOT NULL,member_id text NOT NULL,actor_uid text NOT NULL,
  request_id text NOT NULL CHECK(request_id ~ '^[a-zA-Z0-9_-]{8,128}$'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  policy_version integer NOT NULL CHECK(policy_version>0),policy_snapshot jsonb NOT NULL,
  effective_on date NOT NULL,resume_on date NOT NULL CHECK(resume_on>effective_on),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 250),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','withdrawn')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  decision_reason text CHECK(decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 1 AND 250),
  decided_by text,decided_at timestamptz,change_id text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE(center_id,id),UNIQUE(center_id,actor_uid,request_id),
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  FOREIGN KEY(center_id,member_id,change_id) REFERENCES centers.membership_changes(center_id,member_id,id),
  CHECK((state='pending')=(decided_at IS NULL)),CHECK((state='pending')=(decided_by IS NULL)),
  CHECK((state='approved')=(change_id IS NOT NULL)),CHECK(state<>'rejected' OR decision_reason IS NOT NULL)
);
CREATE UNIQUE INDEX one_pending_freeze ON centers.freeze_requests(center_id,member_id) WHERE state='pending';
CREATE INDEX freeze_request_list ON centers.freeze_requests(center_id,member_id,created_at DESC,id DESC);
ALTER TABLE centers.freeze_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.freeze_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY freeze_request_read ON centers.freeze_requests FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])
    OR actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id)));
CREATE POLICY freeze_request_insert ON centers.freeze_requests FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id) AND state='pending');
CREATE POLICY freeze_request_update ON centers.freeze_requests FOR UPDATE TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])
    OR actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id)))
  WITH CHECK(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])
    OR actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id) AND state='withdrawn'));
CREATE FUNCTION centers.check_freeze_decision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||OLD.center_id));
  IF OLD.state<>'pending' OR NEW.state='pending' OR NEW.decided_by IS DISTINCT FROM centers.actor_uid()
    OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'invalid freeze decision' USING ERRCODE='23514'; END IF;
  IF NEW.state<>'withdrawn' AND NOT (centers.is_platform() OR centers.has_role(OLD.center_id,ARRAY['manager']))
    THEN RAISE EXCEPTION 'freeze decision requires manager' USING ERRCODE='42501'; END IF;
  IF NEW.state='withdrawn' AND (OLD.actor_uid<>centers.actor_uid() OR NOT centers.owns_member(OLD.center_id,OLD.member_id))
    THEN RAISE EXCEPTION 'only request owner may withdraw' USING ERRCODE='42501'; END IF;
  NEW.decided_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER check_freeze_decision BEFORE UPDATE ON centers.freeze_requests FOR EACH ROW EXECUTE FUNCTION centers.check_freeze_decision();
GRANT SELECT ON centers.freeze_requests TO centers_app;
GRANT INSERT(id,center_id,member_id,actor_uid,request_id,input_hash,policy_version,policy_snapshot,effective_on,resume_on,reason) ON centers.freeze_requests TO centers_app;
GRANT UPDATE(state,version,decision_reason,decided_by,decided_at,change_id) ON centers.freeze_requests TO centers_app;
CREATE POLICY freeze_own_audit ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND action IN ('freeze.requested','freeze.withdrawn')
  AND EXISTS(SELECT 1 FROM centers.freeze_requests r WHERE r.center_id=business_audit.center_id AND r.id=target_id
    AND r.actor_uid=centers.actor_uid() AND centers.owns_member(r.center_id,r.member_id)));

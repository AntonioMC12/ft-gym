-- The SQL side contains proposals and delivery tracking; personal routines stay in JSON.
CREATE TABLE centers.training_proposals(
  id text PRIMARY KEY CHECK(id ~ '^tp_[a-f0-9]{32}$'),center_id text NOT NULL,member_id text NOT NULL,
  recipient_uid text NOT NULL,actor_uid text NOT NULL,
  current_revision integer NOT NULL DEFAULT 0 CHECK(current_revision>=0),version integer NOT NULL DEFAULT 1 CHECK(version>0),
  state text NOT NULL DEFAULT 'offered' CHECK(state IN ('offered','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(center_id,id,member_id,recipient_uid),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id));
CREATE INDEX training_proposal_member ON centers.training_proposals(center_id,member_id,created_at DESC,id DESC);
CREATE TABLE centers.training_versions(
  id text PRIMARY KEY CHECK(id ~ '^tv_[a-f0-9]{32}$'),center_id text NOT NULL,proposal_id text NOT NULL,member_id text NOT NULL,
  recipient_uid text NOT NULL,revision integer NOT NULL CHECK(revision>0),actor_uid text NOT NULL,
  delivery_key text NOT NULL UNIQUE CHECK(delivery_key ~ '^td_[a-f0-9]{32}$'),
  bundle jsonb NOT NULL CHECK(jsonb_typeof(bundle)='object' AND octet_length(bundle::text)<=131072),
  bundle_hash text NOT NULL CHECK(bundle_hash ~ '^[a-f0-9]{64}$'),
  routine_ids jsonb NOT NULL CHECK(jsonb_typeof(routine_ids)='object'),
  state text NOT NULL DEFAULT 'offered' CHECK(state IN ('offered','superseded','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(center_id,proposal_id,revision),UNIQUE(center_id,id,member_id,recipient_uid),
  FOREIGN KEY(center_id,proposal_id,member_id,recipient_uid) REFERENCES centers.training_proposals(center_id,id,member_id,recipient_uid));
CREATE TABLE centers.training_acceptances(
  center_id text NOT NULL,version_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
  PRIMARY KEY(version_id,recipient_uid),UNIQUE(center_id,version_id,member_id,recipient_uid),
  FOREIGN KEY(center_id,version_id,member_id,recipient_uid) REFERENCES centers.training_versions(center_id,id,member_id,recipient_uid));
CREATE TABLE centers.training_delivery_acks(
  center_id text NOT NULL,version_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,
  result text NOT NULL CHECK(result IN ('applied','removed')),acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(version_id,recipient_uid),
  FOREIGN KEY(center_id,version_id,member_id,recipient_uid) REFERENCES centers.training_acceptances(center_id,version_id,member_id,recipient_uid));

CREATE FUNCTION centers.training_recipient(target_center text,target_member text,target_uid text) RETURNS boolean LANGUAGE sql STABLE
  SET search_path=pg_catalog AS $$ SELECT target_uid=centers.actor_uid() AND centers.owns_member(target_center,target_member) $$;
CREATE FUNCTION centers.training_staff(target_center text) RETURNS boolean LANGUAGE sql STABLE
  SET search_path=pg_catalog AS $$ SELECT target_center=centers.selected_center() AND (centers.is_platform() OR centers.has_role(target_center,ARRAY['manager','trainer'])) $$;

ALTER TABLE centers.training_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.training_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY training_proposal_read ON centers.training_proposals FOR SELECT TO centers_app USING(
  centers.training_staff(center_id) OR centers.training_recipient(center_id,member_id,recipient_uid));
CREATE POLICY training_proposal_insert ON centers.training_proposals FOR INSERT TO centers_app WITH CHECK(
  centers.training_staff(center_id) AND actor_uid=centers.actor_uid() AND current_revision=0 AND version=1 AND state='offered'
  AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=training_proposals.center_id AND m.id=member_id AND m.account_uid=recipient_uid));
CREATE POLICY training_proposal_update ON centers.training_proposals FOR UPDATE TO centers_app USING(centers.training_staff(center_id)) WITH CHECK(centers.training_staff(center_id));
ALTER TABLE centers.training_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.training_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY training_version_read ON centers.training_versions FOR SELECT TO centers_app USING(
  centers.training_staff(center_id) OR centers.training_recipient(center_id,member_id,recipient_uid));
CREATE POLICY training_version_insert ON centers.training_versions FOR INSERT TO centers_app WITH CHECK(
  centers.training_staff(center_id) AND actor_uid=centers.actor_uid() AND state='offered');
CREATE POLICY training_version_update ON centers.training_versions FOR UPDATE TO centers_app USING(centers.training_staff(center_id)) WITH CHECK(centers.training_staff(center_id));
ALTER TABLE centers.training_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.training_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY training_acceptance_read ON centers.training_acceptances FOR SELECT TO centers_app USING(
  centers.training_staff(center_id) OR centers.training_recipient(center_id,member_id,recipient_uid));
CREATE POLICY training_acceptance_insert ON centers.training_acceptances FOR INSERT TO centers_app WITH CHECK(centers.training_recipient(center_id,member_id,recipient_uid));
ALTER TABLE centers.training_delivery_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.training_delivery_acks FORCE ROW LEVEL SECURITY;
CREATE POLICY training_ack_read ON centers.training_delivery_acks FOR SELECT TO centers_app USING(
  centers.training_staff(center_id) OR centers.training_recipient(center_id,member_id,recipient_uid));
CREATE POLICY training_ack_insert ON centers.training_delivery_acks FOR INSERT TO centers_app WITH CHECK(centers.training_recipient(center_id,member_id,recipient_uid));

CREATE FUNCTION centers.check_training_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent centers.training_proposals; routine jsonb; destination text; destinations text[]='{}'; total integer=0; routine_count integer=0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'offered' OR NEW.state NOT IN ('superseded','withdrawn') THEN RAISE EXCEPTION 'invalid proposal version transition' USING ERRCODE='23514'; END IF;
    IF NEW.state='withdrawn' AND EXISTS(SELECT 1 FROM centers.training_acceptances a WHERE a.center_id=OLD.center_id AND a.version_id=OLD.id) THEN RAISE EXCEPTION 'accepted proposal cannot be withdrawn' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO parent FROM centers.training_proposals p WHERE p.center_id=NEW.center_id AND p.id=NEW.proposal_id;
  IF parent.id IS NULL OR parent.state<>'offered' OR NEW.revision<>parent.current_revision+1 OR NOT EXISTS(
    SELECT 1 FROM centers.members m WHERE m.center_id=NEW.center_id AND m.id=NEW.member_id AND m.account_uid=NEW.recipient_uid)
    THEN RAISE EXCEPTION 'stale proposal recipient or revision' USING ERRCODE='23514'; END IF;
  IF (NEW.bundle->>'opengym_plan') IS DISTINCT FROM '1' OR coalesce(NEW.bundle->>'unit','') NOT IN ('kg','lb') OR jsonb_typeof(NEW.bundle->'routines') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.bundle->'routines') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid proposal bundle' USING ERRCODE='23514'; END IF;
  FOR routine IN SELECT value FROM jsonb_array_elements(NEW.bundle->'routines') LOOP
    routine_count=routine_count+1; destination=NEW.routine_ids->>(routine->>'id');
    IF destination IS NULL OR destination !~ '^cr_[a-f0-9]{32}$' OR destination=ANY(destinations)
      OR jsonb_typeof(routine->'ex') IS DISTINCT FROM 'array' OR jsonb_array_length(routine->'ex') NOT BETWEEN 1 AND 40
      THEN RAISE EXCEPTION 'invalid stable routine map' USING ERRCODE='23514'; END IF;
    destinations=array_append(destinations,destination);total=total+jsonb_array_length(routine->'ex');
  END LOOP;
  IF total>200 OR (SELECT count(*) FROM jsonb_object_keys(NEW.routine_ids))<>routine_count THEN RAISE EXCEPTION 'invalid proposal size' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_training_version BEFORE INSERT OR UPDATE ON centers.training_versions FOR EACH ROW EXECUTE FUNCTION centers.check_training_version();

CREATE FUNCTION centers.check_training_acceptance() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF NOT EXISTS(SELECT 1 FROM centers.training_versions v JOIN centers.training_proposals p ON p.center_id=v.center_id AND p.id=v.proposal_id
    JOIN centers.centers c ON c.id=v.center_id JOIN centers.member_profiles m ON m.center_id=v.center_id AND m.id=v.member_id
    WHERE v.center_id=NEW.center_id AND v.id=NEW.version_id AND v.member_id=NEW.member_id AND v.recipient_uid=NEW.recipient_uid
    AND v.state='offered' AND p.state='offered' AND p.current_revision=v.revision AND c.state='active'
    AND m.account_uid=NEW.recipient_uid AND m.state='active' AND m.joined_on<=m.local_today AND (m.ends_on IS NULL OR m.ends_on>m.local_today))
    THEN RAISE EXCEPTION 'proposal is not available to accept' USING ERRCODE='23514'; END IF;
  NEW.accepted_at=date_trunc('milliseconds',clock_timestamp());
  RETURN NEW;
END $$;
CREATE TRIGGER check_training_acceptance BEFORE INSERT ON centers.training_acceptances FOR EACH ROW EXECUTE FUNCTION centers.check_training_acceptance();

CREATE POLICY training_own_audit ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND action IN ('training.accept','training.ack')
  AND EXISTS(SELECT 1 FROM centers.training_acceptances a WHERE a.center_id=business_audit.center_id AND a.version_id=business_audit.target_id AND centers.training_recipient(a.center_id,a.member_id,a.recipient_uid)));
REVOKE ALL ON centers.training_proposals,centers.training_versions,centers.training_acceptances,centers.training_delivery_acks FROM PUBLIC;
REVOKE ALL ON FUNCTION centers.training_recipient(text,text,text),centers.training_staff(text),centers.check_training_version(),centers.check_training_acceptance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.training_recipient(text,text,text),centers.training_staff(text) TO centers_app;
GRANT SELECT,INSERT ON centers.training_proposals,centers.training_versions,centers.training_acceptances,centers.training_delivery_acks TO centers_app;
GRANT UPDATE(current_revision,version,state) ON centers.training_proposals TO centers_app;
GRANT UPDATE(state) ON centers.training_versions TO centers_app;

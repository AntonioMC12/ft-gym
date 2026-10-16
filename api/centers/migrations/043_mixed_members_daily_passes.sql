-- Explicit manual pass use also applies to members with a monthly fee.
-- Preserve availability, daily replay, RLS, center locks and QR validation.
CREATE OR REPLACE FUNCTION centers.check_pass_consumption() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE local_day date;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
 SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO local_day FROM centers.centers WHERE id=NEW.center_id AND state='active';
 IF local_day IS NULL OR NOT centers.pass_available(NEW.center_id,NEW.member_id,NEW.pass_id,local_day) THEN RAISE EXCEPTION 'pass unavailable' USING ERRCODE='23514'; END IF;
 IF NEW.visit_id IS NULL THEN
  IF NOT centers.access_staff(NEW.center_id)
    OR NOT EXISTS(SELECT 1 FROM centers.member_profiles WHERE center_id=NEW.center_id AND id=NEW.member_id AND state='active' AND joined_on<=local_day AND (ends_on IS NULL OR ends_on>local_day))
    OR EXISTS(SELECT 1 FROM centers.pass_consumptions WHERE center_id=NEW.center_id AND member_id=NEW.member_id AND used_on=local_day)
  THEN RAISE EXCEPTION 'daily pass unavailable' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM centers.access_visits v JOIN centers.access_tokens t ON (t.center_id,t.id)=(v.center_id,v.token_id)
   WHERE v.center_id=NEW.center_id AND v.id=NEW.visit_id AND v.member_id=NEW.member_id AND t.pass_id=NEW.pass_id AND t.consumed_at=v.visited_at)
  THEN RAISE EXCEPTION 'pass admission mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.used_on=local_day;NEW.actor_uid=centers.actor_uid();NEW.created_at=clock_timestamp();RETURN NEW;
END $$;

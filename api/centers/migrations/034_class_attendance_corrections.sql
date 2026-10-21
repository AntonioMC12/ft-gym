-- Preserve the first attendance fact. Rectifications are immutable append-only
-- entries; effective projections and the protected seat counter follow the latest.
CREATE TABLE centers.class_attendance_corrections(
  id text PRIMARY KEY CHECK(id ~ '^ac_[a-f0-9]{32}$'),
  center_id text NOT NULL,class_id text NOT NULL,reservation_id text NOT NULL,
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000000000),
  from_state text NOT NULL CHECK(from_state IN ('attended','no-show')),
  to_state text NOT NULL CHECK(to_state IN ('attended','no-show') AND to_state<>from_state),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 250 AND reason!~'[[:cntrl:]]'),
  actor_uid text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(center_id,reservation_id,revision),
  FOREIGN KEY(center_id,class_id,reservation_id) REFERENCES centers.class_reservations(center_id,class_id,id)
);
ALTER TABLE centers.class_attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.class_attendance_corrections FORCE ROW LEVEL SECURITY;
CREATE POLICY attendance_correction_read ON centers.class_attendance_corrections FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY attendance_correction_insert ON centers.class_attendance_corrections FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY attendance_correction_owner_read ON centers.class_attendance_corrections FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
GRANT SELECT ON centers.class_attendance_corrections TO centers_app;
GRANT INSERT(id,center_id,class_id,reservation_id,revision,to_state,reason,actor_uid) ON centers.class_attendance_corrections TO centers_app;
CREATE FUNCTION centers.check_attendance_correction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE reservation centers.class_reservations; event centers.classes; previous centers.class_attendance_corrections; current_state text; current_revision integer;
BEGIN
  IF NEW.center_id IS DISTINCT FROM centers.selected_center() OR NEW.actor_uid IS DISTINCT FROM centers.actor_uid()
    THEN RAISE EXCEPTION 'selected manager context required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  IF NOT centers.is_platform() THEN
    PERFORM id FROM centers.role_assignments WHERE center_id=NEW.center_id AND account_uid=centers.actor_uid() AND role='manager' FOR SHARE;
    IF NOT EXISTS(SELECT 1 FROM centers.role_assignments WHERE center_id=NEW.center_id AND account_uid=centers.actor_uid() AND role='manager'
      AND revoked_at IS NULL AND valid_from<=clock_timestamp() AND (valid_until IS NULL OR valid_until>clock_timestamp()))
      THEN RAISE EXCEPTION 'current class manager required' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT * INTO event FROM centers.classes WHERE center_id=NEW.center_id AND id=NEW.class_id FOR UPDATE;
  SELECT * INTO reservation FROM centers.class_reservations WHERE center_id=NEW.center_id AND id=NEW.reservation_id AND class_id=NEW.class_id FOR UPDATE;
  IF event.id IS NULL OR reservation.id IS NULL OR reservation.state NOT IN ('attended','no-show') OR event.ends_at>clock_timestamp()
    THEN RAISE EXCEPTION 'attendance correction requires a finished fact' USING ERRCODE='23514'; END IF;
  SELECT * INTO previous FROM centers.class_attendance_corrections WHERE center_id=NEW.center_id AND reservation_id=NEW.reservation_id ORDER BY revision DESC LIMIT 1;
  current_revision=coalesce(previous.revision,0);current_state=coalesce(previous.to_state,reservation.state);
  IF NEW.revision<>current_revision+1 OR NEW.to_state=current_state THEN RAISE EXCEPTION 'attendance revision changed' USING ERRCODE='23514',CONSTRAINT='class_attendance_revision'; END IF;
  NEW.from_state=current_state;
  UPDATE centers.classes SET booked_count=booked_count+(CASE WHEN NEW.to_state='attended' THEN 1 ELSE -1 END)
    WHERE center_id=NEW.center_id AND id=NEW.class_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION centers.check_attendance_correction() FROM PUBLIC;
CREATE TRIGGER attendance_correction_guard BEFORE INSERT ON centers.class_attendance_corrections FOR EACH ROW EXECUTE FUNCTION centers.check_attendance_correction();
-- Own members may read the effective fact, never the private correction reason.
CREATE FUNCTION centers.class_attendance_state(target_center text,target_reservation text)
RETURNS TABLE(effective_state text,attendance_revision integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF target_center IS DISTINCT FROM centers.selected_center() OR NOT (centers.is_platform() OR centers.has_role(target_center,ARRAY['manager'])
    OR EXISTS(SELECT 1 FROM centers.class_reservations r WHERE r.center_id=target_center AND r.id=target_reservation
      AND r.actor_uid=centers.actor_uid() AND centers.owns_member(r.center_id,r.member_id)))
    THEN RAISE EXCEPTION 'attendance projection unavailable' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT coalesce(h.to_state,r.state),coalesce(h.revision,0) FROM centers.class_reservations r
    LEFT JOIN LATERAL(SELECT c.to_state,c.revision FROM centers.class_attendance_corrections c WHERE c.center_id=r.center_id AND c.reservation_id=r.id ORDER BY c.revision DESC LIMIT 1)h ON true
    WHERE r.center_id=target_center AND r.id=target_reservation;
END $$;
REVOKE ALL ON FUNCTION centers.class_attendance_state(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.class_attendance_state(text,text) TO centers_app;
CREATE VIEW centers.class_reservation_profiles WITH (security_invoker=true,security_barrier=true) AS
SELECT r.*,c.effective_state,c.attendance_revision FROM centers.class_reservations r
LEFT JOIN LATERAL centers.class_attendance_state(r.center_id,r.id)c ON true;
REVOKE ALL ON centers.class_reservation_profiles FROM PUBLIC;
GRANT SELECT ON centers.class_reservation_profiles TO centers_app;

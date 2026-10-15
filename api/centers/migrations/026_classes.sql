-- Individually scheduled classes. No automatic charges or no-show penalties.
CREATE TABLE centers.classes(
  id text PRIMARY KEY CHECK(id ~ '^cl_[a-f0-9]{32}$'),center_id text NOT NULL REFERENCES centers.centers(id),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),class_on date NOT NULL,
  starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '13 hours'),timezone text NOT NULL,
  capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 1000),waitlist_capacity integer NOT NULL CHECK(waitlist_capacity BETWEEN 0 AND 1000),
  cancel_before_minutes integer NOT NULL CHECK(cancel_before_minutes BETWEEN 0 AND 10080),
  booked_count integer NOT NULL DEFAULT 0 CHECK(booked_count BETWEEN 0 AND capacity),waiting_count integer NOT NULL DEFAULT 0 CHECK(waiting_count BETWEEN 0 AND waitlist_capacity),
  state text NOT NULL DEFAULT 'scheduled' CHECK(state IN ('scheduled','canceled')),cancel_reason text,
  actor_uid text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE(center_id,id),CHECK(state<>'canceled' OR cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) BETWEEN 1 AND 250)
);
CREATE INDEX classes_schedule ON centers.classes(center_id,starts_at,id);
CREATE TABLE centers.class_plans(
  center_id text NOT NULL,class_id text NOT NULL,plan_id text NOT NULL,
  PRIMARY KEY(center_id,class_id,plan_id),FOREIGN KEY(center_id,class_id) REFERENCES centers.classes(center_id,id),
  FOREIGN KEY(center_id,plan_id) REFERENCES centers.membership_plans(center_id,id)
);
CREATE TABLE centers.class_reservations(
  id text PRIMARY KEY CHECK(id ~ '^rb_[a-f0-9]{32}$'),center_id text NOT NULL,class_id text NOT NULL,member_id text NOT NULL,actor_uid text NOT NULL,
  queue_order bigint NOT NULL CHECK(queue_order>0),state text NOT NULL DEFAULT 'booked' CHECK(state IN ('booked','waiting','canceled','ineligible','attended','no-show')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),reason text CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 250),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE(center_id,class_id,id),UNIQUE(center_id,class_id,queue_order),
  FOREIGN KEY(center_id,class_id) REFERENCES centers.classes(center_id,id),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id)
);
CREATE UNIQUE INDEX one_class_seat ON centers.class_reservations(center_id,class_id,member_id) WHERE state IN ('booked','waiting','attended');
CREATE INDEX class_reservation_queue ON centers.class_reservations(center_id,class_id,state,queue_order);
ALTER TABLE centers.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.classes FORCE ROW LEVEL SECURITY;
CREATE POLICY classes_read ON centers.classes FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (
  centers.is_platform() OR centers.has_role(center_id,ARRAY['manager','trainer']) OR EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=classes.center_id AND m.account_uid=centers.actor_uid())));
CREATE POLICY classes_insert ON centers.classes FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY classes_update ON centers.classes FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager']))) WITH CHECK(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY classes_counter_owner_read ON centers.classes FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
CREATE POLICY classes_counter_owner_update ON centers.classes FOR UPDATE TO centers_migrator USING(center_id=centers.selected_center()) WITH CHECK(center_id=centers.selected_center());
ALTER TABLE centers.class_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.class_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY class_plans_read ON centers.class_plans FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND EXISTS(SELECT 1 FROM centers.classes c WHERE c.center_id=class_plans.center_id AND c.id=class_id));
CREATE POLICY class_plans_insert ON centers.class_plans FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
ALTER TABLE centers.class_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.class_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY reservations_read ON centers.class_reservations FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager']) OR actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id)));
CREATE POLICY reservations_insert ON centers.class_reservations FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id));
CREATE POLICY reservations_update ON centers.class_reservations FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager']) OR actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id)))
  WITH CHECK(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager']) OR actor_uid=centers.actor_uid() AND centers.owns_member(center_id,member_id) AND state='canceled'));
CREATE POLICY reservation_counter_owner_read ON centers.class_reservations FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
CREATE FUNCTION centers.update_class_seats() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event centers.classes; booked_delta integer; waiting_delta integer; manager boolean;
BEGIN
  IF NEW.center_id IS DISTINCT FROM centers.selected_center() THEN RAISE EXCEPTION 'selected center required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||NEW.center_id));
  SELECT * INTO event FROM centers.classes WHERE center_id=NEW.center_id AND id=NEW.class_id FOR UPDATE;
  IF event.id IS NULL THEN RAISE EXCEPTION 'class unavailable' USING ERRCODE='23514'; END IF;
  manager=centers.is_platform() OR centers.has_role(NEW.center_id,ARRAY['manager']);
  IF TG_OP='INSERT' THEN
    IF event.state<>'scheduled' OR event.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'class closed' USING ERRCODE='23514'; END IF;
    IF event.booked_count<event.capacity THEN NEW.state='booked';
    ELSIF event.waiting_count<event.waitlist_capacity THEN NEW.state='waiting';
    ELSE RAISE EXCEPTION 'class full' USING ERRCODE='23514'; END IF;
    SELECT coalesce(max(queue_order),0)+1 INTO NEW.queue_order FROM centers.class_reservations WHERE center_id=NEW.center_id AND class_id=NEW.class_id;
    booked_delta=CASE WHEN NEW.state='booked' THEN 1 ELSE 0 END;waiting_delta=CASE WHEN NEW.state='waiting' THEN 1 ELSE 0 END;
  ELSE
    IF NEW.version<>OLD.version+1 OR NOT (OLD.state='waiting' AND NEW.state IN ('booked','canceled','ineligible') OR OLD.state='booked' AND NEW.state IN ('canceled','attended','no-show'))
      THEN RAISE EXCEPTION 'invalid reservation transition' USING ERRCODE='23514'; END IF;
    -- Administrative transitions are restricted by the caller's RLS. The narrow
    -- owner function below may promote another member after an own cancellation.
    IF NEW.state='canceled' AND NOT manager AND clock_timestamp()>=event.starts_at-make_interval(mins=>event.cancel_before_minutes)
      THEN RAISE EXCEPTION 'cancellation closed' USING ERRCODE='23514'; END IF;
    IF NEW.state='booked' AND (event.state<>'scheduled' OR event.starts_at<=clock_timestamp()) OR NEW.state='attended' AND event.starts_at>clock_timestamp()
      OR NEW.state='no-show' AND event.ends_at>clock_timestamp() THEN RAISE EXCEPTION 'class time conflict' USING ERRCODE='23514'; END IF;
    booked_delta=(CASE WHEN NEW.state IN ('booked','attended') THEN 1 ELSE 0 END)-(CASE WHEN OLD.state='booked' THEN 1 ELSE 0 END);
    waiting_delta=(CASE WHEN NEW.state='waiting' THEN 1 ELSE 0 END)-(CASE WHEN OLD.state='waiting' THEN 1 ELSE 0 END);
  END IF;
  UPDATE centers.classes SET booked_count=booked_count+booked_delta,waiting_count=waiting_count+waiting_delta WHERE center_id=NEW.center_id AND id=NEW.class_id;
  NEW.updated_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER update_class_seats BEFORE INSERT OR UPDATE ON centers.class_reservations FOR EACH ROW EXECUTE FUNCTION centers.update_class_seats();
REVOKE ALL ON FUNCTION centers.update_class_seats() FROM PUBLIC;
GRANT SELECT ON centers.classes,centers.class_plans,centers.class_reservations TO centers_app;
GRANT INSERT(id,center_id,name,class_on,starts_at,ends_at,timezone,capacity,waitlist_capacity,cancel_before_minutes,actor_uid) ON centers.classes TO centers_app;
GRANT UPDATE(state,cancel_reason,version) ON centers.classes TO centers_app;
GRANT INSERT ON centers.class_plans TO centers_app;
GRANT INSERT(id,center_id,class_id,member_id,actor_uid) ON centers.class_reservations TO centers_app;
GRANT UPDATE(state,reason,version) ON centers.class_reservations TO centers_app;
CREATE POLICY own_class_audit ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid()
  AND action IN ('class.reserved','class.reservation.canceled') AND EXISTS(SELECT 1 FROM centers.class_reservations r WHERE r.center_id=business_audit.center_id AND r.id=target_id AND r.actor_uid=centers.actor_uid() AND centers.owns_member(r.center_id,r.member_id)));

CREATE FUNCTION centers.check_class_cancellation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state AND (OLD.state<>'scheduled' OR NEW.state<>'canceled' OR NEW.version<>OLD.version+1 OR OLD.starts_at<=clock_timestamp())
    THEN RAISE EXCEPTION 'invalid class cancellation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_class_cancellation BEFORE UPDATE ON centers.classes FOR EACH ROW EXECUTE FUNCTION centers.check_class_cancellation();
REVOKE ALL ON FUNCTION centers.check_class_cancellation() FROM PUBLIC;

-- Invoker rights: own callers can evaluate only their member/contract through RLS.
CREATE FUNCTION centers.class_eligible(target_class text,target_member text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM centers.classes c JOIN centers.members m ON m.center_id=c.center_id AND m.id=target_member
    JOIN centers.centers center ON center.id=c.center_id
    WHERE c.center_id=centers.selected_center() AND c.id=target_class AND c.state='scheduled' AND center.state='active'
    AND m.account_uid IS NOT NULL AND m.joined_on<=c.class_on AND (m.ends_on IS NULL OR m.ends_on>c.class_on)
    AND coalesce((SELECT h.to_state FROM centers.membership_changes h WHERE h.center_id=m.center_id AND h.member_id=m.id AND h.canceled_at IS NULL
      AND h.effective_on<=c.class_on ORDER BY h.effective_on DESC,h.sequence DESC LIMIT 1),m.state)='active'
    AND EXISTS(SELECT 1 FROM centers.subscriptions s JOIN centers.class_plans p ON p.center_id=s.center_id AND p.class_id=c.id AND p.plan_id=s.plan_id
      WHERE s.center_id=m.center_id AND s.member_id=m.id AND s.canceled_at IS NULL AND s.starts_on<=c.class_on AND (s.ends_on IS NULL OR s.ends_on>c.class_on)))
$$;
REVOKE ALL ON FUNCTION centers.class_eligible(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.class_eligible(text,text) TO centers_app;
-- Owner-only policies support the single selected-center FIFO function. No new
-- cross-member SELECT/UPDATE or RLS bypass privilege is granted to centers_app.
CREATE POLICY class_waitlist_member_owner ON centers.members FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
CREATE POLICY class_waitlist_subscription_owner ON centers.subscriptions FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
CREATE POLICY class_waitlist_history_owner ON centers.membership_changes FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
CREATE POLICY class_waitlist_center_owner ON centers.centers FOR SELECT TO centers_migrator USING(id=centers.selected_center());
CREATE POLICY class_waitlist_plan_owner ON centers.class_plans FOR SELECT TO centers_migrator USING(center_id=centers.selected_center());
CREATE POLICY class_waitlist_reservation_owner ON centers.class_reservations FOR UPDATE TO centers_migrator USING(center_id=centers.selected_center()) WITH CHECK(center_id=centers.selected_center());
CREATE POLICY class_waitlist_audit_owner ON centers.business_audit FOR INSERT TO centers_migrator WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid()
  AND action IN ('class.reservation.canceled','class.waitlist.promoted','class.waitlist.ineligible'));
CREATE FUNCTION centers.cancel_own_class_reservation(target_id text,expected_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE reservation centers.class_reservations; event centers.classes; candidate centers.class_reservations;
BEGIN
  IF centers.selected_center() IS NULL OR centers.selected_center()='' THEN RAISE EXCEPTION 'selected center required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ft-gym-center:'||centers.selected_center()));
  SELECT * INTO reservation FROM centers.class_reservations WHERE center_id=centers.selected_center() AND id=target_id AND actor_uid=centers.actor_uid() FOR UPDATE;
  IF reservation.id IS NULL OR NOT EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=reservation.center_id AND m.id=reservation.member_id AND m.account_uid=centers.actor_uid())
    THEN RAISE EXCEPTION 'own reservation unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO event FROM centers.classes WHERE center_id=reservation.center_id AND id=reservation.class_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM centers.centers WHERE id=reservation.center_id AND state='active')
    THEN RAISE EXCEPTION 'center inactive' USING ERRCODE='23514'; END IF;
  IF expected_version IS NULL OR reservation.version<>expected_version OR reservation.state NOT IN ('booked','waiting') OR event.state<>'scheduled'
    OR clock_timestamp()>=event.starts_at-make_interval(mins=>event.cancel_before_minutes)
    THEN RAISE EXCEPTION 'reservation cancellation conflict' USING ERRCODE='23514'; END IF;
  UPDATE centers.class_reservations SET state='canceled',version=version+1 WHERE id=reservation.id;
  INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id) VALUES(reservation.center_id,centers.actor_uid(),'class.reservation.canceled',reservation.id);
  IF reservation.state='booked' THEN
    FOR candidate IN SELECT * FROM centers.class_reservations WHERE center_id=reservation.center_id AND class_id=reservation.class_id AND state='waiting' ORDER BY queue_order FOR UPDATE LOOP
      IF centers.class_eligible(event.id,candidate.member_id) AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=candidate.center_id AND m.id=candidate.member_id AND m.account_uid=candidate.actor_uid) THEN
        UPDATE centers.class_reservations SET state='booked',version=version+1 WHERE id=candidate.id;
        INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id) VALUES(reservation.center_id,centers.actor_uid(),'class.waitlist.promoted',candidate.id);
        EXIT;
      END IF;
      UPDATE centers.class_reservations SET state='ineligible',reason='membership-or-plan',version=version+1 WHERE id=candidate.id;
      INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id) VALUES(reservation.center_id,centers.actor_uid(),'class.waitlist.ineligible',candidate.id);
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION centers.cancel_own_class_reservation(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centers.cancel_own_class_reservation(text,integer) TO centers_app;

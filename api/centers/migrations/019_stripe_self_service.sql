ALTER TABLE centers.stripe_attempts ADD COLUMN reconcile_requested boolean NOT NULL DEFAULT false;
GRANT UPDATE(reconcile_requested) ON centers.stripe_attempts TO centers_app;
-- Staff enqueue reconciliation without obtaining UPDATE access to gateway state.
CREATE TABLE centers.stripe_reconcile_requests(
  center_id text NOT NULL,attempt_id text NOT NULL,requested_by text NOT NULL,requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(center_id,attempt_id),FOREIGN KEY(center_id,attempt_id) REFERENCES centers.stripe_attempts(center_id,id));
ALTER TABLE centers.stripe_reconcile_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.stripe_reconcile_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY stripe_request_read ON centers.stripe_reconcile_requests FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY stripe_request_insert ON centers.stripe_reconcile_requests FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND requested_by=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY stripe_request_update ON centers.stripe_reconcile_requests FOR UPDATE TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager']))) WITH CHECK(
  center_id=centers.selected_center() AND requested_by=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY stripe_request_delete ON centers.stripe_reconcile_requests FOR DELETE TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform());
REVOKE ALL ON centers.stripe_reconcile_requests FROM PUBLIC;
GRANT SELECT,INSERT,DELETE ON centers.stripe_reconcile_requests TO centers_app;
GRANT UPDATE(requested_by,requested_at) ON centers.stripe_reconcile_requests TO centers_app;
CREATE POLICY stripe_own_prepare ON centers.stripe_attempts FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND audience='own'
  AND centers.owns_member(center_id,member_id) AND state='creating' AND session_id IS NULL
  AND payment_id IS NULL AND received_minor IS NULL AND payment_intent_id IS NULL
  AND checkout_url IS NULL AND evidence IS NULL AND claim_token IS NULL AND settled_at IS NULL);
CREATE POLICY stripe_own_audit ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND action='stripe.attempt.prepared'
  AND EXISTS(SELECT 1 FROM centers.stripe_attempts a WHERE a.center_id=business_audit.center_id
    AND a.id=business_audit.target_id AND a.actor_uid=centers.actor_uid() AND a.audience='own' AND centers.owns_member(a.center_id,a.member_id)));

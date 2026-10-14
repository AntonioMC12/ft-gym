-- Contacts are separate from JSON login identity and staff-entered member contacts.
CREATE TABLE centers.notification_policies (
  center_id text PRIMARY KEY REFERENCES centers.centers(id),
  enabled boolean NOT NULL DEFAULT false, receipts boolean NOT NULL,
  due_lead_days integer NOT NULL CHECK(due_lead_days BETWEEN 0 AND 30),
  debt_repeat_days integer NOT NULL CHECK(debt_repeat_days BETWEEN 1 AND 90),
  price_notice_days integer NOT NULL CHECK(price_notice_days BETWEEN 1 AND 90),
  version integer NOT NULL DEFAULT 1 CHECK(version>0), actor_uid text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), scanned_at timestamptz
);
ALTER TABLE centers.receipts ADD CONSTRAINT receipt_notification_member UNIQUE(center_id,member_id,id);
CREATE TABLE centers.notification_contacts (
  center_id text NOT NULL, account_uid text NOT NULL, member_id text NOT NULL,
  email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254), enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz, challenge_hash text CHECK(challenge_hash ~ '^[a-f0-9]{64}$'), challenge_expires_at timestamptz,
  request_window_at timestamptz NOT NULL DEFAULT now(), request_count integer NOT NULL DEFAULT 1 CHECK(request_count BETWEEN 1 AND 3),
  version integer NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(center_id,account_uid,member_id), FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  CHECK(NOT enabled OR verified_at IS NOT NULL), CHECK((challenge_hash IS NULL)=(challenge_expires_at IS NULL))
);
CREATE TABLE centers.notification_deliveries (
  id text PRIMARY KEY, center_id text NOT NULL, member_id text NOT NULL, account_uid text NOT NULL,
  contact_version integer NOT NULL CHECK(contact_version>0), kind text NOT NULL CHECK(kind IN ('verify','receipt','due','debt','price')),
  event_key text NOT NULL, receipt_id text, subscription_id text,
  payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(payload)='object'),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','blocked','uncertain','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token text, lease_until timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  FOREIGN KEY(center_id,account_uid,member_id) REFERENCES centers.notification_contacts(center_id,account_uid,member_id),
  FOREIGN KEY(center_id,member_id,receipt_id) REFERENCES centers.receipts(center_id,member_id,id),
  FOREIGN KEY(center_id,member_id,subscription_id) REFERENCES centers.subscriptions(center_id,member_id,id),
  UNIQUE(center_id,kind,event_key), UNIQUE(center_id,id),
  CHECK((state='sending')=(claim_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK((kind IN ('receipt','due','debt'))=(receipt_id IS NOT NULL)),
  CHECK((kind='price')=(subscription_id IS NOT NULL))
);
CREATE INDEX notification_ready ON centers.notification_deliveries(center_id,next_attempt_at,id) WHERE state='pending';
CREATE TABLE centers.notification_test_sink (
  delivery_id text PRIMARY KEY, center_id text NOT NULL,
  recipient text NOT NULL CHECK(recipient LIKE '%.invalid'),
  message jsonb NOT NULL CHECK(jsonb_typeof(message)='object'), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(center_id,delivery_id) REFERENCES centers.notification_deliveries(center_id,id)
);
-- Trusted owner checks use only fully qualified objects. Test capture is never a
-- fallback for production email and cannot store non-fixture recipients.
CREATE FUNCTION centers.check_notification_test_sink() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM centers.environment WHERE singleton AND kind='test') THEN
    RAISE EXCEPTION 'notification capture requires isolated test data' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_notification_test_sink BEFORE INSERT ON centers.notification_test_sink FOR EACH ROW EXECUTE FUNCTION centers.check_notification_test_sink();
REVOKE ALL ON FUNCTION centers.check_notification_test_sink() FROM PUBLIC;

ALTER TABLE centers.notification_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.notification_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.notification_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.notification_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.notification_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE centers.notification_test_sink ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers.notification_test_sink FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_policy_read ON centers.notification_policies FOR SELECT TO centers_app USING(
  centers.is_platform() OR (center_id=centers.selected_center() AND centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY notification_policy_insert ON centers.notification_policies FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY notification_policy_update ON centers.notification_policies FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform()) WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY notification_contact_read ON centers.notification_contacts FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR account_uid=centers.actor_uid()));
CREATE POLICY notification_contact_insert ON centers.notification_contacts FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND account_uid=centers.actor_uid() AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=notification_contacts.center_id AND m.id=member_id AND m.account_uid=centers.actor_uid()));
CREATE POLICY notification_contact_update ON centers.notification_contacts FOR UPDATE TO centers_app USING(
  center_id=centers.selected_center() AND account_uid=centers.actor_uid()) WITH CHECK(
  center_id=centers.selected_center() AND account_uid=centers.actor_uid() AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=notification_contacts.center_id AND m.id=member_id AND m.account_uid=centers.actor_uid()));
CREATE POLICY notification_delivery_read ON centers.notification_deliveries FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND (centers.is_platform() OR (kind<>'verify' AND centers.has_role(center_id,ARRAY['manager']))));
CREATE POLICY notification_delivery_insert ON centers.notification_deliveries FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND (centers.is_platform() OR (kind='verify' AND account_uid=centers.actor_uid())));
CREATE POLICY notification_delivery_update ON centers.notification_deliveries FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform()) WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY notification_sink_read ON centers.notification_test_sink FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY notification_sink_insert ON centers.notification_test_sink FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
CREATE POLICY notification_outbox_update ON centers.outbox FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND centers.is_platform()) WITH CHECK(center_id=centers.selected_center() AND centers.is_platform());
REVOKE ALL ON centers.notification_policies,centers.notification_contacts,centers.notification_deliveries,centers.notification_test_sink FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON centers.notification_policies,centers.notification_contacts,centers.notification_deliveries TO centers_app;
GRANT SELECT,INSERT ON centers.notification_test_sink TO centers_app;
GRANT UPDATE(state) ON centers.outbox TO centers_app;
CREATE POLICY notification_command_read ON centers.idempotency_records FOR SELECT TO centers_app USING(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND operation IN ('notification.own.request','notification.own.verify','notification.own.disable'));
CREATE POLICY notification_command_insert ON centers.idempotency_records FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND operation IN ('notification.own.request','notification.own.verify','notification.own.disable')
  AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=idempotency_records.center_id AND m.account_uid=centers.actor_uid()));
CREATE POLICY notification_audit_insert ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(
  center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND action IN ('notification.own.request','notification.own.verify','notification.own.disable')
  AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=business_audit.center_id AND m.account_uid=centers.actor_uid()));

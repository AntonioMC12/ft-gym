ALTER TABLE centers.notification_policies ADD COLUMN enabled_since timestamptz NOT NULL DEFAULT now();
UPDATE centers.notification_policies SET enabled_since=updated_at;
-- Pin the agreed notice floor when a contract change is scheduled; later center
-- policy edits cannot silently rewrite an already scheduled change's notice terms.
ALTER TABLE centers.subscriptions ADD COLUMN notice_days integer CHECK(notice_days BETWEEN 1 AND 90);
CREATE INDEX notification_due_candidates ON centers.receipts(center_id,due_on,id);

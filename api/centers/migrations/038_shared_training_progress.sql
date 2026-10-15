-- Only the currently linked owner can grant/revoke a scoped metadata projection.
CREATE TABLE centers.progress_shares(
  center_id text NOT NULL,member_id text NOT NULL,recipient_uid text NOT NULL,
  enabled boolean NOT NULL,starts_on date,ends_on date,routine_ids text[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(center_id,member_id,recipient_uid),FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),
  CHECK(cardinality(routine_ids)<=20 AND array_position(routine_ids,NULL) IS NULL),
  CHECK(NOT enabled OR starts_on IS NOT NULL AND ends_on IS NOT NULL AND starts_on<=ends_on AND ends_on-starts_on<=365 AND cardinality(routine_ids)>0)
);
ALTER TABLE centers.progress_shares ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.progress_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_share_read ON centers.progress_shares FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND
  (centers.training_recipient(center_id,member_id,recipient_uid) OR enabled AND centers.training_staff(center_id)));
CREATE POLICY progress_share_insert ON centers.progress_shares FOR INSERT TO centers_app WITH CHECK(
  centers.training_recipient(center_id,member_id,recipient_uid) AND version=1);
CREATE POLICY progress_share_update ON centers.progress_shares FOR UPDATE TO centers_app USING(centers.training_recipient(center_id,member_id,recipient_uid))
  WITH CHECK(centers.training_recipient(center_id,member_id,recipient_uid));
GRANT SELECT ON centers.progress_shares TO centers_app;
GRANT INSERT(center_id,member_id,recipient_uid,enabled,starts_on,ends_on,routine_ids) ON centers.progress_shares TO centers_app;
GRANT UPDATE(enabled,starts_on,ends_on,routine_ids,version,updated_at) ON centers.progress_shares TO centers_app;
CREATE POLICY progress_own_audit ON centers.business_audit FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center()
  AND actor_uid=centers.actor_uid() AND action='training.progress.share'
  AND EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=business_audit.center_id AND m.id=target_id AND m.account_uid=centers.actor_uid()));

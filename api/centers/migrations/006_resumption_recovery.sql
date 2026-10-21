-- A pending manual change can temporarily replace an automatic resumption. Keep its
-- provenance so canceling that pending change can restore the original future deadline.
ALTER TABLE centers.membership_changes ADD COLUMN superseded_by text;
ALTER TABLE centers.membership_changes ADD CONSTRAINT resumption_superseder
  FOREIGN KEY(center_id,member_id,superseded_by) REFERENCES centers.membership_changes(center_id,member_id,id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE centers.membership_changes ADD CONSTRAINT automatic_resumption_superseded
  CHECK(superseded_by IS NULL OR (parent_id IS NOT NULL AND canceled_at IS NOT NULL));
GRANT UPDATE(superseded_by) ON centers.membership_changes TO centers_app;

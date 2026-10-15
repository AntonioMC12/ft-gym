CREATE TABLE centers.retention_policies(
  center_id text PRIMARY KEY REFERENCES centers.centers(id),enabled boolean NOT NULL DEFAULT false,
  days_without_visit integer CHECK(days_without_visit BETWEEN 1 AND 3650),include_never_visited boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),actor_uid text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(NOT enabled OR days_without_visit IS NOT NULL)
);
ALTER TABLE centers.retention_policies ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_policy_read ON centers.retention_policies FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY retention_policy_insert ON centers.retention_policies FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND version=1 AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY retention_policy_update ON centers.retention_policies FOR UPDATE TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager']))) WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
GRANT SELECT ON centers.retention_policies TO centers_app;
GRANT INSERT(center_id,enabled,days_without_visit,include_never_visited,actor_uid) ON centers.retention_policies TO centers_app;
GRANT UPDATE(enabled,days_without_visit,include_never_visited,version,actor_uid,updated_at) ON centers.retention_policies TO centers_app;
CREATE TABLE centers.retention_actions(
  id text PRIMARY KEY CHECK(id ~ '^ra_[a-f0-9]{32}$'),center_id text NOT NULL,member_id text NOT NULL,
  episode_key text NOT NULL CHECK(length(episode_key) BETWEEN 1 AND 100),outcome text NOT NULL CHECK(outcome IN ('reviewed','contacted','dismissed')),
  note text CHECK(length(note)<=500),actor_uid text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(center_id,member_id) REFERENCES centers.members(center_id,id),UNIQUE(center_id,member_id,episode_key),
  CHECK(outcome<>'dismissed' OR note IS NOT NULL AND length(btrim(note))>0)
);
CREATE INDEX retention_action_page ON centers.retention_actions(center_id,created_at DESC,id DESC);
ALTER TABLE centers.retention_actions ENABLE ROW LEVEL SECURITY;ALTER TABLE centers.retention_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_action_read ON centers.retention_actions FOR SELECT TO centers_app USING(center_id=centers.selected_center() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
CREATE POLICY retention_action_insert ON centers.retention_actions FOR INSERT TO centers_app WITH CHECK(center_id=centers.selected_center() AND actor_uid=centers.actor_uid() AND (centers.is_platform() OR centers.has_role(center_id,ARRAY['manager'])));
GRANT SELECT ON centers.retention_actions TO centers_app;
GRANT INSERT(id,center_id,member_id,episode_key,outcome,note,actor_uid) ON centers.retention_actions TO centers_app;

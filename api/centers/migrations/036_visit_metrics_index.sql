-- Period-bounded center/global admission aggregates; no new personal data.
CREATE INDEX access_visit_center_time ON centers.access_visits(center_id,visited_at);

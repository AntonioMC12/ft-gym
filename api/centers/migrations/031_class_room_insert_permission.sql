-- Classes intentionally use column-level writes: permit the new creation field
-- without granting edits to room, times, prices, counters or historical terms.
GRANT INSERT(room) ON centers.classes TO centers_app;

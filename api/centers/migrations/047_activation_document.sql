-- Admission identity stays in the center-scoped SQL store, never personal training or auth exports.
-- NULL preserves requests made before this requirement. Existing member documents stay unchanged.
ALTER TABLE centers.activation_requests ADD COLUMN national_document text
 CHECK(national_document IS NULL OR national_document ~ '^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$');
CREATE INDEX members_activation_document ON centers.members
 (center_id,(regexp_replace(upper(national_document),'[ .-]','','g')))
 WHERE national_document IS NOT NULL;

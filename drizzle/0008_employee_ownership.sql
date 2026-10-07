-- Preserve established links. Backfill only an unambiguous verified account and record.
-- Conflicting/ambiguous records remain untouched and are rejected by runtime claims.
UPDATE employees e SET user_id = u.id FROM "user" u
WHERE e.user_id IS NULL AND u.email_verified = true
  AND lower(trim(e.email)) = lower(trim(u.email))
  AND NOT EXISTS (SELECT 1 FROM employees linked WHERE linked.user_id = u.id)
  AND (SELECT count(*) FROM employees x WHERE lower(trim(x.email)) = lower(trim(u.email))) = 1
  AND (SELECT count(*) FROM "user" x WHERE lower(trim(x.email)) = lower(trim(u.email))) = 1;

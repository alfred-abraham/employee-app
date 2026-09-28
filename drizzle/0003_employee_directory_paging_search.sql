CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS employees_name_id_idx ON employees (last_name, first_name, id);
CREATE INDEX IF NOT EXISTS employees_first_name_trgm_idx ON employees USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_last_name_trgm_idx ON employees USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_full_name_trgm_idx ON employees USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_email_trgm_idx ON employees USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_company_trgm_idx ON employees USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_job_title_trgm_idx ON employees USING gin (job_title gin_trgm_ops);

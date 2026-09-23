ALTER TABLE purchase_requests
    ADD COLUMN IF NOT EXISTS number TEXT,
    ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS planned_date DATE,
    ADD COLUMN IF NOT EXISTS actual_date DATE,
    ADD COLUMN IF NOT EXISTS supplier TEXT,
    ADD COLUMN IF NOT EXISTS price NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS quantity_received REAL,
    ADD COLUMN IF NOT EXISTS link TEXT,
    ADD COLUMN IF NOT EXISTS equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL;

ALTER TABLE purchase_requests
    DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

ALTER TABLE purchase_requests
    ADD CONSTRAINT purchase_requests_status_check
    CHECK (status IN ('pending', 'approved', 'done', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_pr_status   ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_author   ON purchase_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_pr_created  ON purchase_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS service_request_files (
    id              SERIAL PRIMARY KEY,
    request_id      INT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT,
    size            BIGINT,
    uploaded_by     INT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_srf_req ON service_request_files(request_id);

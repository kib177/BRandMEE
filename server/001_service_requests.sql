CREATE TABLE IF NOT EXISTS service_requests (
    id              SERIAL PRIMARY KEY,
    number          TEXT,
    title           TEXT NOT NULL,
    work_type       TEXT DEFAULT 'Модернизация',
    description     TEXT,
    location        TEXT,
    equipment_id    INT REFERENCES equipment(id) ON DELETE SET NULL,
    justification   TEXT,
    tech_task       TEXT,
    needed_by       DATE,
    responsible     TEXT,
    photo_path      TEXT,
    author_id       INT REFERENCES users(id) ON DELETE SET NULL,
    department_id   INT REFERENCES departments(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS service_request_parts (
    id              SERIAL PRIMARY KEY,
    request_id      INT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    inventory_code  TEXT NOT NULL,
    department_id   INT NOT NULL,
    quantity        NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit            TEXT,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_sr_parts_req ON service_request_parts(request_id);


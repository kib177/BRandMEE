-- 1. Создаём таблицу, если её нет
CREATE TABLE IF NOT EXISTS purchase_requests (
    id SERIAL PRIMARY KEY,
    requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'ШТ',
    justification TEXT,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'done', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    comment TEXT
);

-- 2. Расширяем таблицу новыми полями
ALTER TABLE purchase_requests
    ADD COLUMN IF NOT EXISTS number TEXT,
    ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS planned_date DATE,
    ADD COLUMN IF NOT EXISTS actual_date DATE,
    ADD COLUMN IF NOT EXISTS supplier TEXT,
    ADD COLUMN IF NOT EXISTS price NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS quantity_received REAL,
    ADD COLUMN IF NOT EXISTS link TEXT,
    ADD COLUMN IF NOT EXISTS equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS file_path TEXT;

-- 3. Обновляем набор допустимых статусов
ALTER TABLE purchase_requests
    DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

ALTER TABLE purchase_requests
    ADD CONSTRAINT purchase_requests_status_check
    CHECK (status IN ('pending', 'approved', 'done', 'rejected'));

-- 4. Индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_pr_status  ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_author  ON purchase_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_pr_created ON purchase_requests(created_at DESC);

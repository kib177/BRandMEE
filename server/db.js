const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'warehouse.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT DEFAULT '',
    type TEXT DEFAULT 'Прочее',
    equipment TEXT DEFAULT '',
    location TEXT DEFAULT '',
    unit TEXT DEFAULT 'ШТ',
    quantity REAL DEFAULT 0,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
  CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory(type);
  CREATE INDEX IF NOT EXISTS idx_inventory_equipment ON inventory(equipment);
  CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory(date);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS write_offs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    equipment TEXT DEFAULT '',
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'ШТ',
    requested_by TEXT DEFAULT 'сотрудник',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    comment TEXT DEFAULT '',
    FOREIGN KEY (item_code) REFERENCES inventory(code)
  );

  CREATE INDEX IF NOT EXISTS idx_wo_status ON write_offs(status);
  CREATE INDEX IF NOT EXISTS idx_wo_requested_at ON write_offs(requested_at);
`);

module.exports = db;

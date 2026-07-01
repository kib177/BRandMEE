/**
 * Warehouse Management System
 * Copyright (c) 2026 Kirill Brigi
 * Licensed under MIT
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'warehouse.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS part_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS inventory (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT DEFAULT '',
    type_id INTEGER,
    equipment_id INTEGER,
    location TEXT DEFAULT '',
    unit TEXT DEFAULT 'ШТ',
    quantity REAL DEFAULT 0,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (type_id) REFERENCES part_types(id),
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
  CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory(type_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_equipment ON inventory(equipment_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory(date);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','moderator')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS write_offs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    equipment_id INTEGER,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'ШТ',
    requested_by TEXT DEFAULT 'сотрудник',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    comment TEXT DEFAULT '',
    FOREIGN KEY (item_code) REFERENCES inventory(code),
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
  );

  CREATE INDEX IF NOT EXISTS idx_wo_status ON write_offs(status);
  CREATE INDEX IF NOT EXISTS idx_wo_requested_at ON write_offs(requested_at);
`);

// Миграция – если старый столбец equipment существует, переносим в equipment_id
try {
  const woCols = db.prepare("PRAGMA table_info('write_offs')").all().map(c => c.name);
  if (woCols.includes('equipment') && !woCols.includes('equipment_id')) {
    db.exec(`ALTER TABLE write_offs ADD COLUMN equipment_id INTEGER REFERENCES equipment(id)`);
    const rows = db.prepare(`SELECT id, equipment FROM write_offs WHERE equipment IS NOT NULL AND equipment != ''`).all();
    const insert = db.prepare(`INSERT OR IGNORE INTO equipment (name) VALUES (?)`);
    const update = db.prepare(`UPDATE write_offs SET equipment_id = ? WHERE id = ?`);
    for (const row of rows) {
      insert.run(row.equipment);
      const eq = db.prepare(`SELECT id FROM equipment WHERE name = ?`).get(row.equipment);
      if (eq) update.run(eq.id, row.id);
    }
  }
} catch (e) {
  console.log('Миграция write_offs не потребовалась:', e.message);
}

// Пользователи по умолчанию
const salt = bcrypt.genSaltSync(10);
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)');
insertUser.run('admin', bcrypt.hashSync('admin123', salt), 'admin');
insertUser.run('moderator', bcrypt.hashSync('moderator123', salt), 'moderator');

module.exports = db;

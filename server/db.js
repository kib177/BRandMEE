const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'warehouse.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========== ТАБЛИЦЫ ==========
db.exec(`
  -- Типы запчастей
  CREATE TABLE IF NOT EXISTS part_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- Оборудование
  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- Основная таблица запчастей (теперь ссылается на типы и оборудование)
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

  -- Индексы
  CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
  CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory(type_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_equipment ON inventory(equipment_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory(date);

  -- Таблица пользователей
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','moderator')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Таблица списаний
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

// ========== МИГРАЦИЯ СТАРЫХ ДАННЫХ ==========
// Переносим существующие текстовые поля type и equipment в новые таблицы
const migrate = () => {
  const tableInfo = db.prepare("PRAGMA table_info('inventory')").all();
  const hasTypeId = tableInfo.some(col => col.name === 'type_id');
  if (!hasTypeId) {
    // Добавляем новые столбцы, если их ещё нет (на случай, если старая схема)
    db.exec(`ALTER TABLE inventory ADD COLUMN type_id INTEGER REFERENCES part_types(id)`);
    db.exec(`ALTER TABLE inventory ADD COLUMN equipment_id INTEGER REFERENCES equipment(id)`);
  }

  // Перенос типов
  const oldTypes = db.prepare(`SELECT DISTINCT type FROM inventory WHERE type IS NOT NULL AND type != '' AND type != 'Прочее'`).all();
  const insertType = db.prepare(`INSERT OR IGNORE INTO part_types (name) VALUES (?)`);
  for (const row of oldTypes) {
    insertType.run(row.type);
  }
  // Убедимся, что есть тип "Прочее"
  insertType.run('Прочее');

  // Обновляем type_id
  db.prepare(`UPDATE inventory SET type_id = (SELECT id FROM part_types WHERE name = inventory.type)`).run();
  // Для тех, у кого type_id остался NULL, ставим "Прочее"
  db.prepare(`UPDATE inventory SET type_id = (SELECT id FROM part_types WHERE name = 'Прочее') WHERE type_id IS NULL`).run();

  // Перенос оборудования
  const oldEquips = db.prepare(`SELECT DISTINCT equipment FROM inventory WHERE equipment IS NOT NULL AND equipment != ''`).all();
  const insertEquip = db.prepare(`INSERT OR IGNORE INTO equipment (name) VALUES (?)`);
  for (const row of oldEquips) {
    insertEquip.run(row.equipment);
  }
  // Обновляем equipment_id
  db.prepare(`UPDATE inventory SET equipment_id = (SELECT id FROM equipment WHERE name = inventory.equipment) WHERE equipment IS NOT NULL AND equipment != ''`).run();

  // Для write_offs: добавляем equipment_id и переносим
  const woColumns = db.prepare("PRAGMA table_info('write_offs')").all();
  if (!woColumns.some(c => c.name === 'equipment_id')) {
    db.exec(`ALTER TABLE write_offs ADD COLUMN equipment_id INTEGER REFERENCES equipment(id)`);
  }
  const woEquips = db.prepare(`SELECT DISTINCT equipment FROM write_offs WHERE equipment IS NOT NULL AND equipment != ''`).all();
  for (const row of woEquips) {
    insertEquip.run(row.equipment);
  }
  db.prepare(`UPDATE write_offs SET equipment_id = (SELECT id FROM equipment WHERE name = write_offs.equipment) WHERE equipment IS NOT NULL AND equipment != ''`).run();

  console.log('Миграция завершена');
};

migrate();

// ========== ПОЛЬЗОВАТЕЛИ ПО УМОЛЧАНИЮ ==========
const salt = bcrypt.genSaltSync(10);
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)');
insertUser.run('admin', bcrypt.hashSync('admin123', salt), 'admin');
insertUser.run('moderator', bcrypt.hashSync('moderator123', salt), 'moderator');

module.exports = db;

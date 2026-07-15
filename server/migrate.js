const pool = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'moderator', 'storekeeper', 'user');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS part_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS equipment (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role user_role NOT NULL,
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS inventory (
        code TEXT NOT NULL,
        department_id INTEGER REFERENCES departments(id),
        name TEXT NOT NULL,
        model TEXT DEFAULT '',
        type_id INTEGER REFERENCES part_types(id) ON DELETE SET NULL,
        equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
        location TEXT DEFAULT '',
        unit TEXT DEFAULT 'ШТ',
        quantity REAL DEFAULT 0,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (code, department_id)
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_department ON inventory(department_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);

      CREATE TABLE IF NOT EXISTS write_offs (
        id SERIAL PRIMARY KEY,
        item_code TEXT NOT NULL,
        department_id INTEGER REFERENCES departments(id),
        item_name TEXT NOT NULL,
        equipment_id INTEGER REFERENCES equipment(id),
        quantity REAL NOT NULL,
        unit TEXT DEFAULT 'ШТ',
        requested_by TEXT DEFAULT 'сотрудник',
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        comment TEXT DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_wo_status ON write_offs(status);
      CREATE INDEX IF NOT EXISTS idx_wo_department ON write_offs(department_id);
    `);
    console.log('Таблицы созданы');
  } finally {
    client.release();
  }
  await pool.end();
}

migrate().catch(err => console.error(err));

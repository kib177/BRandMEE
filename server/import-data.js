const sqlite3 = require('better-sqlite3');
const pool = require('./db');

const oldDb = sqlite3('/opt/warehouse/server/warehouse.db');

async function importData() {
  // 1. Создаём дефолтный отдел
  await pool.query(`INSERT INTO departments (name) VALUES ('Основной склад') ON CONFLICT DO NOTHING`);
  const { rows } = await pool.query(`SELECT id FROM departments WHERE name = 'Основной склад'`);
  const defaultDept = rows[0].id;

  // 2. part_types
  const types = oldDb.prepare('SELECT * FROM part_types').all();
  for (const t of types) {
    await pool.query('INSERT INTO part_types (name) VALUES ($1) ON CONFLICT DO NOTHING', [t.name]);
  }

  // 3. equipment
  const equips = oldDb.prepare('SELECT * FROM equipment').all();
  for (const e of equips) {
    await pool.query('INSERT INTO equipment (name) VALUES ($1) ON CONFLICT DO NOTHING', [e.name]);
  }

  // 4. inventory
  const items = oldDb.prepare('SELECT * FROM inventory').all();
  for (const item of items) {
    await pool.query(`
      INSERT INTO inventory (code, department_id, name, model, type_id, equipment_id, location, unit, quantity, date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (code, department_id) DO NOTHING
    `, [item.code, defaultDept, item.name, item.model, item.type_id, item.equipment_id, item.location, item.unit, item.quantity, item.date]);
  }

  // 5. users (преобразуем роли)
  const users = oldDb.prepare('SELECT * FROM users').all();
  for (const u of users) {
    await pool.query(`
      INSERT INTO users (username, password_hash, role, department_id)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (username) DO NOTHING
    `, [u.username, u.password_hash, u.role, (u.role === 'admin' || u.role === 'moderator') ? null : defaultDept]);
  }

  // 6. write_offs
  const writeoffs = oldDb.prepare('SELECT * FROM write_offs').all();
  for (const w of writeoffs) {
    await pool.query(`
      INSERT INTO write_offs (id, item_code, department_id, item_name, equipment_id, quantity, unit, requested_by, status, requested_at, resolved_at, comment)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [w.id, w.item_code, defaultDept, w.item_name, w.equipment_id, w.quantity, w.unit, w.requested_by, w.status, w.requested_at, w.resolved_at, w.comment]);
  }

  console.log('Импорт завершён');
  pool.end();
}

importData().catch(err => console.error(err));

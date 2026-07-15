const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const XLSX = require('xlsx');

// Вспомогательные функции для получения/создания типа и оборудования
async function getOrCreateTypeId(typeName) {
  if (!typeName || !typeName.trim()) return null;
  const name = typeName.trim();
  let res = await pool.query('SELECT id FROM part_types WHERE name = $1', [name]);
  if (res.rows.length === 0) {
    res = await pool.query('INSERT INTO part_types (name) VALUES ($1) RETURNING id', [name]);
  }
  return res.rows[0].id;
}

async function getOrCreateEquipmentId(equipName) {
  if (!equipName || !equipName.trim()) return null;
  const name = equipName.trim();
  let res = await pool.query('SELECT id FROM equipment WHERE name = $1', [name]);
  if (res.rows.length === 0) {
    res = await pool.query('INSERT INTO equipment (name) VALUES ($1) RETURNING id', [name]);
  }
  return res.rows[0].id;
}

// Все позиции (с учётом авторизации и фильтра по отделу)
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Базовый запрос с JOIN
    let query = `
      SELECT i.*, pt.name AS type_name, eq.name AS equipment_name, d.name AS department_name
      FROM inventory i
      LEFT JOIN part_types pt ON i.type_id = pt.id
      LEFT JOIN equipment eq ON i.equipment_id = eq.id
      JOIN departments d ON i.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Фильтр по отделу (для не-админов только свой отдел, админы могут фильтровать через ?department_id)
    if (req.user.role !== 'admin') {
      query += ` AND i.department_id = $${paramIndex++}`;
      params.push(req.user.department_id);
    } else if (req.query.department_id) {
      query += ` AND i.department_id = $${paramIndex++}`;
      params.push(req.query.department_id);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// Одна позиция по коду (с учётом отдела)
router.get('/:code', authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT i.*, pt.name AS type_name, eq.name AS equipment_name
      FROM inventory i
      LEFT JOIN part_types pt ON i.type_id = pt.id
      LEFT JOIN equipment eq ON i.equipment_id = eq.id
      WHERE i.code = $1
    `;
    const params = [req.params.code];

    if (req.user.role !== 'admin') {
      query += ` AND i.department_id = $2`;
      params.push(req.user.department_id);
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// Добавление или обновление позиции (только для своего отдела или админ)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, name, model, type_id, equipment_id, location, unit, quantity, date } = req.body;
    if (!code || !name || !date) {
      return res.status(400).json({ error: 'code, name, date обязательны' });
    }

    // Определяем отдел: для не-админа принудительно свой, админ может указать или берём по умолчанию 1
    let departmentId = req.user.department_id;
    if (req.user.role === 'admin' && req.body.department_id) {
      departmentId = req.body.department_id;
    }
    if (!departmentId) departmentId = 1; // fallback на основной склад

    await pool.query(`
      INSERT INTO inventory (code, department_id, name, model, type_id, equipment_id, location, unit, quantity, date, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      ON CONFLICT (code, department_id) DO UPDATE SET
        name = EXCLUDED.name, model = EXCLUDED.model, type_id = EXCLUDED.type_id,
        equipment_id = EXCLUDED.equipment_id, location = EXCLUDED.location,
        unit = EXCLUDED.unit, quantity = EXCLUDED.quantity, date = EXCLUDED.date,
        updated_at = CURRENT_TIMESTAMP
    `, [code, departmentId, name, model, type_id || null, equipment_id || null, location, unit, quantity, date]);

    res.json({ ok: true, code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

// Массовое добавление (bulk) – для админа/модератора
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Ожидается непустой массив' });
    }
    // Упрощённо: все добавляются в отдел текущего пользователя или 1
    const departmentId = req.user.department_id || 1;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(`
          INSERT INTO inventory (code, department_id, name, model, type_id, equipment_id, location, unit, quantity, date, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CURRENT_TIMESTAMP)
          ON CONFLICT (code, department_id) DO UPDATE SET
            name = EXCLUDED.name, model = EXCLUDED.model, type_id = EXCLUDED.type_id,
            equipment_id = EXCLUDED.equipment_id, location = EXCLUDED.location,
            unit = EXCLUDED.unit, quantity = EXCLUDED.quantity, date = EXCLUDED.date,
            updated_at = CURRENT_TIMESTAMP
        `, [item.code, departmentId, item.name, item.model, item.type_id || null, item.equipment_id || null, item.location, item.unit, item.quantity, item.date]);
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: items.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка массового сохранения' });
  }
});

// Удаление позиции (по коду и отделу)
router.delete('/:code', authMiddleware, async (req, res) => {
  try {
    // Удаляем только из своего отдела (или админ может удалять из любого, но нужно передать department_id?)
    const departmentId = req.user.department_id || 1;
    const result = await pool.query('DELETE FROM inventory WHERE code = $1 AND department_id = $2 RETURNING code', [req.params.code, departmentId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Не найдено' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// Удаление всех позиций (только админ, удаляет из всех отделов)
router.delete('/', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для администратора' });
  try {
    await pool.query('DELETE FROM inventory');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка очистки' });
  }
});

// Импорт CSV
router.post('/import-csv', authMiddleware, upload.single('file'), async (req, res) => {
  // ... (аналогично старой логике, но с использованием pool и адаптацией)
  // Эта часть может быть объёмной, предлагаю пока пропустить, если не нужна срочно.
  // Аналогично импорт Excel.
  res.status(501).json({ error: 'Импорт временно недоступен' });
});

module.exports = router;

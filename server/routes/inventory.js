const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const XLSX = require('xlsx');

// Вспомогательные функции
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

function resolveDepartment(req, res, next) {
  const role = req.user?.role;
  const userDept = req.user?.department_id;

  if (role === 'admin') {
    req.allowedDepartmentId = req.query.department_id || req.body.department_id || null;
  } else {
    req.allowedDepartmentId = userDept;
  }
  next();
}

// GET все позиции
router.get('/', authMiddleware, resolveDepartment, async (req, res) => {
  try {
    let query = `
      SELECT i.code, i.department_id, i.name, i.model, i.type_id, i.equipment_id,
             i.location, i.unit, i.quantity,
             TO_CHAR(i.date, 'DD.MM.YYYY') AS date,
             i.created_at, i.updated_at,
             pt.name AS type_name, eq.name AS equipment_name, d.name AS department_name
      FROM inventory i
      LEFT JOIN part_types pt ON i.type_id = pt.id
      LEFT JOIN equipment eq ON i.equipment_id = eq.id
      JOIN departments d ON i.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    if (req.allowedDepartmentId) {
      query += ` AND i.department_id = $1`;
      params.push(req.allowedDepartmentId);
    }
    query += ' ORDER BY i.updated_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// GET экспорт Excel
router.get('/export-excel', authMiddleware, resolveDepartment, async (req, res) => {
  // ... (ваш текущий код экспорта, он рабочий, оставьте без изменений)
});

// GET одна позиция
router.get('/:code', async (req, res) => {
  // ... (ваш текущий код, он рабочий)
});

// POST / – добавление/обновление
router.post('/', authMiddleware, resolveDepartment, async (req, res) => {
  // ... (ваш текущий код, он рабочий)
});

// POST /bulk
router.post('/bulk', authMiddleware, resolveDepartment, async (req, res) => {
  // ... (ваш текущий код)
});

// DELETE /:code
router.delete('/:code', authMiddleware, resolveDepartment, async (req, res) => {
  // ... (ваш текущий код)
});

// DELETE /
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

// Импорт CSV (исправленный)
router.post('/import-csv', authMiddleware, requireRole('admin', 'moderator', 'storekeeper'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    let departmentId;
    if (req.user.role === 'admin') {
      departmentId = req.body.department_id || req.user.department_id || 1;
    } else {
      departmentId = req.user.department_id || 1;
    }

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    // ... полный код парсинга CSV, который у вас был, но без битых `...`
    // В конце вставки используйте переменную departmentId
    // Пример:
    const items = []; // результат парсинга
    // ... ваш код парсинга ...
    if (items.length === 0) return res.status(400).json({ error: 'Нет данных' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(`
          INSERT INTO inventory (code, department_id, name, model, type_id, equipment_id, location, unit, quantity, date, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, TO_DATE($10, 'DD.MM.YYYY'), CURRENT_TIMESTAMP)
          ON CONFLICT (code, department_id) DO UPDATE SET
            name = EXCLUDED.name, model = EXCLUDED.model, type_id = EXCLUDED.type_id,
            equipment_id = EXCLUDED.equipment_id, location = EXCLUDED.location,
            unit = EXCLUDED.unit, quantity = EXCLUDED.quantity, date = EXCLUDED.date,
            updated_at = CURRENT_TIMESTAMP
        `, [item.code, departmentId, item.name, item.model, item.type_id, item.equipment_id, item.location, item.unit, item.quantity, item.date]);
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: items.length, skippedCount: 0 });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка импорта CSV' });
  }
});

// Импорт Excel (исправленный)
router.post('/import-excel', authMiddleware, requireRole('admin', 'moderator', 'storekeeper'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    let departmentId;
    if (req.user.role === 'admin') {
      departmentId = req.body.department_id || req.user.department_id || 1;
    } else {
      departmentId = req.user.department_id || 1;
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    // ... полный код парсинга Excel ...
    const items = []; // результат парсинга
    // ... ваш код парсинга ...
    if (items.length === 0) return res.status(400).json({ error: 'Нет данных' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(`
          INSERT INTO inventory (code, department_id, name, model, type_id, equipment_id, location, unit, quantity, date, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, TO_DATE($10, 'DD.MM.YYYY'), CURRENT_TIMESTAMP)
          ON CONFLICT (code, department_id) DO UPDATE SET
            name = EXCLUDED.name, model = EXCLUDED.model, type_id = EXCLUDED.type_id,
            equipment_id = EXCLUDED.equipment_id, location = EXCLUDED.location,
            unit = EXCLUDED.unit, quantity = EXCLUDED.quantity, date = EXCLUDED.date,
            updated_at = CURRENT_TIMESTAMP
        `, [item.code, departmentId, item.name, item.model, item.type_id, item.equipment_id, item.location, item.unit, item.quantity, item.date]);
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: items.length, skippedCount: 0 });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка импорта Excel' });
  }
});

module.exports = router;

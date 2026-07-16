const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const XLSX = require('xlsx');


// ---------- Вспомогательные функции ----------
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

// Middleware для определения доступного отдела
function resolveDepartment(req, res, next) {
  const role = req.user?.role;
  const userDept = req.user?.department_id;

  if (role === 'admin' || role === 'moderator') {
    // Администратор может фильтровать по желанию через query или body
    req.allowedDepartmentId = req.query.department_id || req.body.department_id || null;
    // Если явно указан, используем его, иначе без ограничения (видит всё)
  } else {
    // Обычный пользователь – только свой отдел
    req.allowedDepartmentId = userDept;
  }
  next();
}

// ---------- GET / (все позиции) ----------
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

// ---------- GET /export-excel (аналогично с фильтром) ----------
router.get('/export-excel', authMiddleware, resolveDepartment, async (req, res) => {
  try {
    let query = `
      SELECT i.code, i.name, i.model, i.location, i.unit, i.quantity,
             TO_CHAR(i.date, 'DD.MM.YYYY') AS date,
             pt.name AS type_name, eq.name AS equipment_name
      FROM inventory i
      LEFT JOIN part_types pt ON i.type_id = pt.id
      LEFT JOIN equipment eq ON i.equipment_id = eq.id
      WHERE 1=1
    `;
    const params = [];
    if (req.allowedDepartmentId) {
      query += ` AND i.department_id = $1`;
      params.push(req.allowedDepartmentId);
    }
    query += ' ORDER BY i.updated_at DESC';
    const result = await pool.query(query, params);
    const data = result.rows.map(item => ({
      'Код': item.code,
      'Наименование': item.name,
      'Модель': item.model,
      'Тип': item.type_name || '',
      'Оборудование': item.equipment_name || '',
      'Расположение': item.location,
      'Ед.изм.': item.unit,
      'Количество': item.quantity,
      'Дата': item.date
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Склад');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=warehouse.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка экспорта Excel' });
  }
});

// ---------- GET /:code (одна позиция) ----------
// ---------- GET /:code (одна позиция) – ОТКРЫТ ----------
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // Ищем позицию по коду (без фильтрации по отделу)
    let result = await pool.query(`
      SELECT i.code, i.department_id, i.name, i.model, i.type_id, i.equipment_id,
             i.location, i.unit, i.quantity,
             TO_CHAR(i.date, 'DD.MM.YYYY') AS date,
             i.created_at, i.updated_at,
             pt.name AS type_name, eq.name AS equipment_name
      FROM inventory i
      LEFT JOIN part_types pt ON i.type_id = pt.id
      LEFT JOIN equipment eq ON i.equipment_id = eq.id
      WHERE i.code = $1
      ORDER BY i.department_id
      LIMIT 1
    `, [code]);

    // Если запись не найдена – 404
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Позиция с таким кодом не найдена' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});
// ---------- POST / (добавление/обновление) ----------
router.post('/', authMiddleware, resolveDepartment, async (req, res) => {
  try {
    const { code, name, model, type_id, equipment_id, location, unit, quantity, date } = req.body;
    if (!code || !name || !date) {
      return res.status(400).json({ error: 'code, name, date обязательны' });
    }

    // Определяем отдел
    let departmentId = req.allowedDepartmentId;
    if (!departmentId) {
      // Если админ не указал отдел, используем первый доступный (или 1)
      departmentId = req.body.department_id || 1;
    }

    await pool.query(`
      INSERT INTO inventory (code, department_id, name, model, type_id, equipment_id, location, unit, quantity, date, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TO_DATE($10, 'DD.MM.YYYY'), CURRENT_TIMESTAMP)
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

// ---------- POST /bulk ----------
router.post('/bulk', authMiddleware, resolveDepartment, async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Ожидается непустой массив' });
    }
    let departmentId = req.allowedDepartmentId || req.body.department_id || 1;
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

// ---------- DELETE /:code ----------
router.delete('/:code', authMiddleware, resolveDepartment, async (req, res) => {
  try {
    const departmentId = req.allowedDepartmentId;
    if (!departmentId) return res.status(400).json({ error: 'Не указан отдел' });
    const result = await pool.query('DELETE FROM inventory WHERE code = $1 AND department_id = $2 RETURNING code', [req.params.code, departmentId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Не найдено' });
    res.json({ ok: true });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// ---------- DELETE / ----------
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

// ---------- ИМПОРТ CSV ----------
router.post('/import-csv', authMiddleware, upload.single('file'), async (req, res) => {
  // (используем req.user.department_id)
  // ... остальной код импорта, назначающий department_id из req.user ...
  res.status(501).json({ error: 'Импорт временно недоступен' });
});

// ---------- ИМПОРТ EXCEL ----------
router.post('/import-excel', authMiddleware, upload.single('file'), async (req, res) => {
  // аналогично
  res.status(501).json({ error: 'Импорт временно недоступен' });
});

module.exports = router;

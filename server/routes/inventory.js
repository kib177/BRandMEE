const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
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

// ---------- GET / (все позиции) ----------
router.get('/', authMiddleware, async (req, res) => {
  try {
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

    // Фильтр по отделу: не-админ видит только свой отдел
    if (req.user.role !== 'admin') {
      query += ` AND i.department_id = $${paramIndex++}`;
      params.push(req.user.department_id);
    } else if (req.query.department_id) {
      query += ` AND i.department_id = $${paramIndex++}`;
      params.push(req.query.department_id);
    }

    query += ' ORDER BY i.updated_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// ---------- GET /export-excel ----------
router.get('/export-excel', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, pt.name AS type_name, eq.name AS equipment_name
      FROM inventory i
      LEFT JOIN part_types pt ON i.type_id = pt.id
      LEFT JOIN equipment eq ON i.equipment_id = eq.id
      ORDER BY i.updated_at DESC
    `);

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

// ---------- POST / (добавление/обновление) ----------
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, name, model, type_id, equipment_id, location, unit, quantity, date } = req.body;
    if (!code || !name || !date) {
      return res.status(400).json({ error: 'code, name, date обязательны' });
    }

    // Определяем отдел
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

// ---------- POST /bulk ----------
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Ожидается непустой массив' });
    }

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

// ---------- DELETE /:code ----------
router.delete('/:code', authMiddleware, async (req, res) => {
  try {
    const departmentId = req.user.department_id || 1;
    const result = await pool.query('DELETE FROM inventory WHERE code = $1 AND department_id = $2 RETURNING code', [req.params.code, departmentId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Не найдено или недостаточно прав' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// ---------- DELETE / (очистка всей таблицы, только админ) ----------
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
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    const MAX_ROWS = 10000;
    if (lines.length - 1 > MAX_ROWS) {
      return res.status(400).json({ error: `Слишком большой файл. Максимум ${MAX_ROWS} строк данных.` });
    }
    if (lines.length < 2) return res.status(400).json({ error: 'Файл пуст или содержит только заголовок' });

    const header = lines[0].split(';');
    const idx = (name) => header.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
    const codeIndex   = idx('код');
    const nameIndex   = idx('наименование');
    const modelIndex  = idx('модель');
    const typeIndex   = idx('тип');
    const equipIndex  = idx('оборудование');
    const locIndex    = idx('расположение');
    const unitIndex   = idx('ед.изм.');
    const qtyIndex    = idx('количество');
    const dateIndex   = idx('дата');

    if (codeIndex === -1 || nameIndex === -1 || unitIndex === -1 || qtyIndex === -1 || dateIndex === -1) {
      return res.status(400).json({ error: 'Обязательные колонки: Код, Наименование, Ед.изм., Количество, Дата' });
    }

    const items = [];
    const skipped = [];

    const parseDate = (raw) => {
      raw = raw.trim();
      let parts;
      if (raw.includes('.')) parts = raw.split('.');
      else if (raw.includes('-')) parts = raw.split('-');
      else if (raw.includes('/')) parts = raw.split('/');
      else return null;
      if (parts.length !== 3) return null;

      let day, month, year;
      if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
      else if (parts[2].length === 4) { day = parts[0]; month = parts[1]; year = parts[2]; }
      else return null;

      const d = parseInt(day,10), m = parseInt(month,10), y = parseInt(year,10);
      if (isNaN(d)||isNaN(m)||isNaN(y)) return null;
      if (d<1||d>31||m<1||m>12||y<2000||y>2099) return null;
      return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
    };

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';');
      if (cols.length < Math.max(codeIndex,nameIndex,unitIndex,qtyIndex,dateIndex)+1) {
        skipped.push({ line: i+1, reason: 'Недостаточно колонок' });
        continue;
      }

      const code = (cols[codeIndex] || '').trim();
      const name = (cols[nameIndex] || '').trim();
      if (!code || !name) {
        skipped.push({ line: i+1, reason: 'Пустой код или наименование' });
        continue;
      }

      const model    = modelIndex >= 0 ? (cols[modelIndex] || '').trim() : '';
      const typeName = typeIndex >= 0 ? (cols[typeIndex] || '').trim() : 'Прочее';
      const equipName = equipIndex >= 0 ? (cols[equipIndex] || '').trim() : '';
      const location = locIndex >= 0 ? (cols[locIndex] || '').trim() : '';
      const unit     = (cols[unitIndex] || '').trim();
      const qtyRaw   = (cols[qtyIndex] || '').replace(',', '.').replace(/\s/g, '');
      const dateRaw  = (cols[dateIndex] || '').trim();

      if (!unit || !qtyRaw || !dateRaw) {
        skipped.push({ line: i+1, reason: 'Пустая ед.изм., количество или дата' });
        continue;
      }

      const quantity = parseFloat(qtyRaw);
      if (isNaN(quantity) || quantity < 0) {
        skipped.push({ line: i+1, reason: `Некорректное количество: ${qtyRaw}` });
        continue;
      }

      const formattedDate = parseDate(dateRaw);
      if (!formattedDate) {
        skipped.push({ line: i+1, reason: `Некорректная дата: ${dateRaw}` });
        continue;
      }

      // Преобразуем названия в ID (создаём при необходимости)
      const typeId = await getOrCreateTypeId(typeName || 'Прочее');
      const equipmentId = await getOrCreateEquipmentId(equipName);

      items.push({
        code, name, model,
        type_id: typeId,
        equipment_id: equipmentId,
        location,
        unit,
        quantity,
        date: formattedDate
      });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'Не удалось извлечь ни одной корректной записи', skipped });
    }

    // Вставляем в БД
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
        `, [item.code, departmentId, item.name, item.model, item.type_id, item.equipment_id, item.location, item.unit, item.quantity, item.date]);
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: items.length, skippedCount: skipped.length });
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

// ---------- ИМПОРТ EXCEL ----------
router.post('/import-excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, dateNF: 'dd"."mm"."yyyy' });
    const MAX_ROWS = 10000;
    if (rawData.length - 1 > MAX_ROWS) {
      return res.status(400).json({ error: `Слишком большой файл. Максимум ${MAX_ROWS} строк данных.` });
    }
    if (rawData.length < 2) return res.status(400).json({ error: 'Файл пуст или содержит только заголовок' });

    const header = rawData[0].map(h => String(h).trim().toLowerCase());

    const findIndex = (keywords) => header.findIndex(h => keywords.some(k => h.includes(k)));

    const codeIndex   = findIndex(['код']);
    const nameIndex   = findIndex(['наименован', 'назван', 'имя']);
    const modelIndex  = findIndex(['модель', 'артикул']);
    const typeIndex   = findIndex(['тип']);
    const equipIndex  = findIndex(['оборудован', 'станок']);
    const locIndex    = findIndex(['расположен', 'местоположен', 'ячейк', 'стеллаж']);
    const unitIndex   = findIndex(['ед.изм', 'единиц', 'измерен']);
    const qtyIndex    = findIndex(['количеств', 'кол-во', 'остаток']);
    const dateIndex   = findIndex(['дат']);

    if (codeIndex === -1 || nameIndex === -1 || unitIndex === -1 || qtyIndex === -1 || dateIndex === -1) {
      return res.status(400).json({ error: 'Обязательные столбцы не найдены...' });
    }

    const items = [];
    const skipped = [];

    const parseDate = (raw) => {
      const str = String(raw).trim();
      let parts;
      if (str.includes('.')) parts = str.split('.');
      else if (str.includes('-')) parts = str.split('-');
      else if (str.includes('/')) parts = str.split('/');
      else return null;

      if (parts && parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
        else if (parts[2].length === 4) { day = parts[0]; month = parts[1]; year = parts[2]; }
        else { month = parts[0]; day = parts[1]; year = parts[2]; if (year.length === 2) year = '20' + year; }

        const d = parseInt(day,10), m = parseInt(month,10), y = parseInt(year,10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y) &&
            d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2099) {
          return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
        }
      }
      return null;
    };

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const code = String(row[codeIndex] || '').trim();
      const name = String(row[nameIndex] || '').trim();
      if (!code || !name) { skipped.push({ row: i+1, reason: 'Пустой код или наименование' }); continue; }

      const model    = modelIndex >= 0 ? String(row[modelIndex] || '').trim() : '';
      const typeName = typeIndex >= 0 ? String(row[typeIndex] || '').trim() : 'Прочее';
      const equipName = equipIndex >= 0 ? String(row[equipIndex] || '').trim() : '';
      const location = locIndex >= 0 ? String(row[locIndex] || '').trim() : '';
      const unit     = String(row[unitIndex] || '').trim();
      const qtyRaw   = String(row[qtyIndex] || '').replace(',', '.').replace(/\s/g, '');
      const dateRaw  = String(row[dateIndex] || '').trim();

      if (!unit || !qtyRaw || !dateRaw) { skipped.push({ row: i+1, reason: 'Пустые обязательные поля' }); continue; }
      const quantity = parseFloat(qtyRaw);
      if (isNaN(quantity) || quantity < 0) { skipped.push({ row: i+1, reason: `Некорректное количество: ${qtyRaw}` }); continue; }

      const formattedDate = parseDate(dateRaw);
      if (!formattedDate) { skipped.push({ row: i+1, reason: `Некорректная дата: ${dateRaw}` }); continue; }

      const typeId = await getOrCreateTypeId(typeName || 'Прочее');
      const equipmentId = await getOrCreateEquipmentId(equipName);

      items.push({
        code, name, model,
        type_id: typeId,
        equipment_id: equipmentId,
        location,
        unit,
        quantity,
        date: formattedDate
      });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'Не удалось извлечь корректные записи', skipped });
    }

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
        `, [item.code, departmentId, item.name, item.model, item.type_id, item.equipment_id, item.location, item.unit, item.quantity, item.date]);
      }
      await client.query('COMMIT');
      res.json({ ok: true, count: items.length, skippedCount: skipped.length });
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

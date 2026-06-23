const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, AUTH_PASSWORD } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});
const XLSX = require('xlsx');

// Получить ID типа, создав его при необходимости
function getOrCreateTypeId(typeName) {
  if (!typeName || !typeName.trim()) return null;
  const name = typeName.trim();
  let row = db.prepare('SELECT id FROM part_types WHERE name = ?').get(name);
  if (!row) {
    const insert = db.prepare('INSERT INTO part_types (name) VALUES (?)');
    row = { id: insert.run(name).lastInsertRowid };
  }
  return row.id;
}

// Получить ID оборудования, создав его при необходимости
function getOrCreateEquipmentId(equipName) {
  if (!equipName || !equipName.trim()) return null;
  const name = equipName.trim();
  let row = db.prepare('SELECT id FROM equipment WHERE name = ?').get(name);
  if (!row) {
    const insert = db.prepare('INSERT INTO equipment (name) VALUES (?)');
    row = { id: insert.run(name).lastInsertRowid };
  }
  return row.id;
}

// Получить все записи
router.get('/', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT i.*, pt.name AS type_name, eq.name AS equipment_name
      FROM inventory i
      LEFT JOIN part_types pt ON i.type_id = pt.id
      LEFT JOIN equipment eq ON i.equipment_id = eq.id
      ORDER BY i.updated_at DESC
    `).all();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// Экспорт в Excel
router.get('/export-excel', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM inventory ORDER BY updated_at DESC').all();
    
    // Переименовываем ключи для русских заголовков
    const data = items.map(item => ({
      'Код': item.code,
      'Наименование': item.name,
      'Модель': item.model,
      'Тип': item.type,
      'Оборудование': item.equipment,
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

// Получить одну запись
router.get('/:code', (req, res) => {
  const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  res.json(item);
});

// Добавить или обновить запись
router.post('/', authMiddleware, (req, res) => {
  try {
    const { code, name, model, type_id, equipment_id, location, unit, quantity, date } = req.body;
    if (!code || !name || !date) {
      return res.status(400).json({ error: 'code, name, date обязательны' });
    }
    db.prepare(`
      INSERT INTO inventory (code, name, model, type_id, equipment_id, location, unit, quantity, date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET
        name=excluded.name, model=excluded.model, type_id=excluded.type_id,
        equipment_id=excluded.equipment_id, location=excluded.location,
        unit=excluded.unit, quantity=excluded.quantity, date=excluded.date,
        updated_at=CURRENT_TIMESTAMP
    `).run(code, name, model, type_id || null, equipment_id || null, location, unit, quantity, date);
    res.json({ ok: true, code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

// Массовое добавление
router.post('/bulk', authMiddleware, (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Ожидается непустой массив' });
    }
    const stmt = db.prepare(`
      INSERT INTO inventory (code, name, model, type, equipment, location, unit, quantity, date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET
        name=excluded.name, model=excluded.model, type=excluded.type,
        equipment=excluded.equipment, location=excluded.location,
        unit=excluded.unit, quantity=excluded.quantity, date=excluded.date,
        updated_at=CURRENT_TIMESTAMP
    `);
    const insertAll = db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.code, item.name, item.model, item.type, item.equipment, item.location, item.unit, item.quantity, item.date);
      }
    });
    insertAll(items);
    res.json({ ok: true, count: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка массового сохранения' });
  }
});

// Удалить запись
router.delete('/:code', authMiddleware, (req, res) => {
  try {
    const info = db.prepare('DELETE FROM inventory WHERE code = ?').run(req.params.code);
    if (info.changes === 0) return res.status(404).json({ error: 'Не найдено' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// Удалить все записи
router.delete('/', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM inventory').run();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка очистки' });
  }
});

// Импорт CSV
router.post('/import-csv', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
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
      return res.status(400).json({ 
        error: 'Обязательные колонки: Код, Наименование, Ед.изм., Количество, Дата' 
      });
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

      const typeName = typeIndex >= 0 ? (cols[typeIndex] || '').trim() : 'Прочее';
const equipName = equipIndex >= 0 ? (cols[equipIndex] || '').trim() : '';

const typeId = getOrCreateTypeId(typeName || 'Прочее');
const equipmentId = getOrCreateEquipmentId(equipName);

items.push({
  code, name, model,
  type_id: typeId,
  equipment_id: equipmentId,
  location,
  unit,
  quantity,
  date: formattedDate
});

    if (items.length === 0) {
      return res.status(400).json({ 
        error: 'Не удалось извлечь ни одной корректной записи', 
        skipped 
      });
    }

    const stmt = db.prepare(`
  INSERT INTO inventory (code, name, model, type_id, equipment_id, location, unit, quantity, date, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(code) DO UPDATE SET
    name=excluded.name, model=excluded.model, type_id=excluded.type_id,
    equipment_id=excluded.equipment_id, location=excluded.location,
    unit=excluded.unit, quantity=excluded.quantity, date=excluded.date,
    updated_at=CURRENT_TIMESTAMP
`);
    const insertAll = db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.code, item.name, item.model, item.type, item.equipment, item.location, item.unit, item.quantity, item.date);
      }
    });
    insertAll(items);

    res.json({ 
      ok: true, 
      count: items.length, 
      skipped: skipped.length > 0 ? skipped : undefined 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка импорта CSV' });
  }
});
   
// Импорт Excel
router.post('/import-excel', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rawData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      raw: false,
      dateNF: 'dd"."mm"."yyyy'
    });
    
    if (rawData.length < 2) return res.status(400).json({ error: 'Файл пуст или содержит только заголовок' });

    const header = rawData[0].map(h => String(h).trim().toLowerCase());
    
    const findIndex = (keywords) => {
      return header.findIndex(h => keywords.some(k => h.includes(k)));
    };
    
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
      return res.status(400).json({ 
        error: 'Обязательные столбцы не найдены. Проверьте заголовки: Код, Наименование, Ед.изм., Количество, Дата'
      });
    }

    const items = [];
    const skipped = [];

    const parseDate = (raw) => {
      const str = String(raw).trim();
      let parts;
      if (str.includes('.')) parts = str.split('.');
      else if (str.includes('-')) parts = str.split('-');
      else if (str.includes('/')) parts = str.split('/');
      
      if (parts && parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
        else if (parts[2].length === 4) { day = parts[0]; month = parts[1]; year = parts[2]; }
        else return null;
        const d = parseInt(day,10), m = parseInt(month,10), y = parseInt(year,10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d>=1 && d<=31 && m>=1 && m<=12 && y>=2000 && y<=2099) {
          return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
        }
        return null;
      }
      
      const num = parseFloat(str);
      if (!isNaN(num) && num > 40000 && num < 60000) {
        const d = new Date((num - 25569) * 86400 * 1000);
        const day = String(d.getDate()).padStart(2,'0');
        const month = String(d.getMonth() + 1).padStart(2,'0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
      }
      
      return null;
    };

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const code = String(row[codeIndex] || '').trim();
      const name = String(row[nameIndex] || '').trim();
      if (!code || !name) { skipped.push({ row: i+1, reason: 'Пустой код или наименование' }); continue; }

      const model    = modelIndex >= 0 ? String(row[modelIndex] || '').trim() : '';
      const location = locIndex >= 0 ? String(row[locIndex] || '').trim() : '';
      const unit     = String(row[unitIndex] || '').trim();
      const qtyRaw   = String(row[qtyIndex] || '').replace(',', '.').replace(/\s/g, '');
      const dateRaw  = String(row[dateIndex] || '').trim();

      if (!unit || !qtyRaw || !dateRaw) { skipped.push({ row: i+1, reason: 'Пустые обязательные поля' }); continue; }
      const quantity = parseFloat(qtyRaw);
      if (isNaN(quantity) || quantity < 0) { skipped.push({ row: i+1, reason: `Некорректное количество: ${qtyRaw}` }); continue; }

      const formattedDate = parseDate(dateRaw);
      if (!formattedDate) { skipped.push({ row: i+1, reason: `Некорректная дата: ${dateRaw}` }); continue; }

      const typeName = typeIndex >= 0 ? String(row[typeIndex] || '').trim() : 'Прочее';
const equipName = equipIndex >= 0 ? String(row[equipIndex] || '').trim() : '';

const typeId = getOrCreateTypeId(typeName || 'Прочее');
const equipmentId = getOrCreateEquipmentId(equipName);

items.push({
  code, name, model,
  type_id: typeId,
  equipment_id: equipmentId,
  location,
  unit,
  quantity,
  date: formattedDate
});

    if (items.length === 0) {
      return res.status(400).json({ 
        error: 'Не удалось извлечь корректные записи', 
        skipped 
      });
    }

    const stmt = db.prepare(`
      INSERT INTO inventory (code, name, model, type, equipment, location, unit, quantity, date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET
        name=excluded.name, model=excluded.model, type=excluded.type,
        equipment=excluded.equipment, location=excluded.location,
        unit=excluded.unit, quantity=excluded.quantity, date=excluded.date,
        updated_at=CURRENT_TIMESTAMP
    `);
    const insertAll = db.transaction((items) => {
      for (const item of items) stmt.run(item.code, item.name, item.model, item.type, item.equipment, item.location, item.unit, item.quantity, item.date);
    });
    insertAll(items);

    res.json({ ok: true, count: items.length, skipped: skipped.length > 0 ? skipped : undefined });
  } catch (err) {
    console.error('Ошибка в import-excel:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;

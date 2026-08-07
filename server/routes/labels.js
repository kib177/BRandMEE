const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const bwipjs = require('bwip-js');

router.post('/generate', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  try {
    let { codes } = req.body;
    let result;

    if (codes && Array.isArray(codes) && codes.length > 0) {
      const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
      result = await pool.query(`
        SELECT code, model, name FROM inventory
        WHERE code IN (${placeholders})
        ORDER BY code
      `, codes);
    } else {
      result = await pool.query(`
        SELECT code, model, name FROM inventory
        ORDER BY code
      `);
    }

    const rows = result.rows;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Нет позиций для генерации наклеек' });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Наклейки');

    // Ширина колонок (примерно 70 мм каждая)
    sheet.getColumn(1).width = 35;
    sheet.getColumn(2).width = 35;

    for (const row of rows) {
      const article = String(row.model || row.code);
      const codeLine = `Код материала: S${row.code}`;
      const name = String(row.name || '');

      // === Строка 1: Артикул ===
      const row1 = sheet.addRow([article, article]);
      row1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      row1.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
      row1.height = 18;

      // === Строка 2: Код материала ===
      const row2 = sheet.addRow([codeLine, codeLine]);
      row2.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      row2.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
      row2.height = 18;

      // === Строка 3: Название (колонка A) и штрихкод (колонка B) ===
      const row3 = sheet.addRow([name, '']);
      row3.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      row3.height = 65;

      // Генерируем штрихкод Code 128
      const pngBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: String(row.code),
        scale: 3,
        height: 10,
        includetext: false,
        textxalign: 'center',
      });

      const imageId = workbook.addImage({
        buffer: pngBuffer,
        extension: 'png',
      });

      // Вставляем изображение строго в ячейку B3 текущего блока
      // row3.number - 1, т.к. ExcelJS считает строки с 0 для изображений
      sheet.addImage(imageId, {
        tl: { col: 1, row: row3.number - 1 },
        ext: { width: 140, height: 50 },
        editAs: 'oneCell',  // ← ключевое исправление: привязываем изображение к одной ячейке
      });

      // === Пустая строка-разделитель между наклейками ===
      const separator = sheet.addRow(['', '']);
      separator.height = 8;
    }

    res.setHeader('Content-Disposition', 'attachment; filename=labels.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Ошибка генерации наклеек:', err);
    res.status(500).json({ error: 'Ошибка генерации наклеек' });
  }
});

router.get('/items', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT code, name FROM inventory ORDER BY code');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки позиций' });
  }
});

module.exports = router;

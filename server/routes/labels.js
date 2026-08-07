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

    // Ширина колонок (≈70 мм каждая)
    sheet.getColumn(1).width = 35;
    sheet.getColumn(2).width = 35;

    for (const row of rows) {
      const article = row.model || row.code;
      const codeLine = `Код материала: S${row.code}`;
      const name = row.name;

      // Добавляем три строки для позиции
      const row1 = sheet.addRow([article, '']);                // A1, B1 пусто
      const row2 = sheet.addRow([codeLine, '']);               // A2, B2 пусто
      const row3 = sheet.addRow([name, '']);                   // A3, B3 – сюда штрихкод

      // Стилизуем (выравнивание, высота)
      row1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      row2.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      row3.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

      // Устанавливаем базовую высоту строк
      row1.height = 20;
      row2.height = 20;
      row3.height = 60; // третья строка выше для штрихкода

      // Генерируем штрихкод Code 128
      const pngBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: row.code,
        scale: 3,
        height: 10,          // мм
        includetext: false,
        textxalign: 'center',
      });

      const imageId = workbook.addImage({
        buffer: pngBuffer,
        extension: 'png',
      });

      // Вставляем изображение в ячейку B3 (колонка 2, строка row3)
      sheet.addImage(imageId, {
        tl: { col: 1, row: row3.number - 1 },   // col 1 = B, row начинается с 0
        ext: { width: 140, height: 50 },
      });
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

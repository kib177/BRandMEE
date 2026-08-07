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

    // Ширина колонок = 36 (примерно 70 мм)
    sheet.getColumn(1).width = 36;
    sheet.getColumn(2).width = 36;

    // Стили по умолчанию для всех ячеек
    const boldCenter = {
      bold: true,
      size: 10,
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true
    };

    for (const row of rows) {
      const article = String(row.model || row.code);
      const codeLine = `Код материала: S${row.code}`;
      const name = String(row.name || '');

      // === Строка 1: Артикул (высота 15) ===
      const row1 = sheet.addRow([article, article]);
      row1.height = 15;
      row1.getCell(1).alignment = boldCenter;
      row1.getCell(1).font = { bold: true, size: 10 };
      row1.getCell(2).alignment = boldCenter;
      row1.getCell(2).font = { bold: true, size: 10 };

      // === Строка 2: Код материала (высота 15) ===
      const row2 = sheet.addRow([codeLine, codeLine]);
      row2.height = 15;
      row2.getCell(1).alignment = boldCenter;
      row2.getCell(1).font = { bold: true, size: 10 };
      row2.getCell(2).alignment = boldCenter;
      row2.getCell(2).font = { bold: true, size: 10 };

      // === Строка 3: Название + штрихкод (высота 90) ===
      const row3 = sheet.addRow([name, '']);
      row3.height = 90;
      row3.getCell(1).alignment = { ...boldCenter, vertical: 'middle' };
      row3.getCell(1).font = { bold: true, size: 10 };
      row3.getCell(2).alignment = boldCenter; // для штрихкода

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

      // Вставляем изображение строго в ячейку B3
      sheet.addImage(imageId, {
        tl: { col: 1, row: row3.number - 1 },
        ext: { width: 140, height: 50 },
        editAs: 'oneCell',
      });

      // === Пустая строка-разделитель ===
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

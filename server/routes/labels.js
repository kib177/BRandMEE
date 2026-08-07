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
      const article = row.model || row.code;
      const codeLine = `Код материала: S${row.code}`;
      const name = row.name;

      // Используем символ перевода строки (\n) – ExcelJS поддерживает при wrapText
      const leftText = `${article}\n${codeLine}\n${name}`;
      const rightText = `${article}\n${codeLine}`;

      const newRow = sheet.addRow([]);
      const rowNumber = newRow.number;

      // Левая ячейка (A)
      const leftCell = sheet.getCell(`A${rowNumber}`);
      leftCell.value = leftText;
      leftCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      leftCell.font = { size: 10 };

      // Правая ячейка (B) – сначала текст
      const rightCell = sheet.getCell(`B${rowNumber}`);
      rightCell.value = rightText;
      rightCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      rightCell.font = { size: 10 };

      // Генерируем штрихкод
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

      // Вставляем изображение штрихкода в ячейку B со смещением 1.2 см (~432 000 EMU)
      sheet.addImage(imageId, {
        tl: { col: 1, row: rowNumber - 1, offsetY: 432000 },
        ext: { width: 150, height: 40 },
      });

      // Высота строки – достаточно для трёх строк текста и штрихкода
      sheet.getRow(rowNumber).height = 100;
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

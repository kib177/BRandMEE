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

      // Левая ячейка (A) – три строки текста
      const leftText = `${article}\n${codeLine}\n${name}`;

      // Правая ячейка (B) – две верхние строки (артикул + код материала), штрихкод будет вставлен ниже
      const rightText = `${article}\n${codeLine}`;

      const newRow = sheet.addRow([]);
      const rowNumber = newRow.number;

      // Заполняем ячейку A
      const leftCell = sheet.getCell(`A${rowNumber}`);
      leftCell.value = leftText;
      leftCell.alignment = { wrapText: true, vertical: 'top' };
      leftCell.font = { size: 9 };

      // Заполняем ячейку B (только текст)
      const rightCell = sheet.getCell(`B${rowNumber}`);
      rightCell.value = rightText;
      rightCell.alignment = { wrapText: true, vertical: 'top' };
      rightCell.font = { size: 9 };

      // Генерируем штрихкод Code 128
      const pngBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: row.code,
        scale: 3,
        height: 10,          // высота штрихкода в мм
        includetext: false,   // без текста под штрихкодом
        textxalign: 'center',
      });

      const imageId = workbook.addImage({
        buffer: pngBuffer,
        extension: 'png',
      });

      // Вставляем изображение штрихкода в ячейку B, смещая вниз на 35 пикселей (под текст)
      sheet.addImage(imageId, {
        tl: { col: 1, row: rowNumber - 1 }, // col 1 = B, row отсчитывается от 0
        ext: { width: 160, height: 40 },
      });

      // Увеличиваем высоту строки, чтобы вместить три строки текста + штрихкод
      sheet.getRow(rowNumber).height = 65;
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

// Список позиций для выбора
router.get('/items', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT code, name FROM inventory ORDER BY code');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки позиций' });
  }
});

module.exports = router;

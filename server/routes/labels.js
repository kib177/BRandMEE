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

      // Используем \r\n для корректного переноса строк в Excel
      const leftText = `${article}\r\n${codeLine}\r\n${name}`;
      const rightText = `${article}\r\n${codeLine}`;

      const newRow = sheet.addRow([]);
      const rowNumber = newRow.number;

      // Левая ячейка (A) – три строки текста
      const leftCell = sheet.getCell(`A${rowNumber}`);
      leftCell.value = leftText;
      leftCell.alignment = { wrapText: true, vertical: 'top' };
      leftCell.font = { size: 10 };

      // Правая ячейка (B) – две верхние строки текста
      const rightCell = sheet.getCell(`B${rowNumber}`);
      rightCell.value = rightText;
      rightCell.alignment = { wrapText: true, vertical: 'top' };
      rightCell.font = { size: 10 };

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

      // Вставляем изображение штрихкода в ячейку B со смещением вниз,
      // чтобы не перекрыть текст (35 пикселей ≈ 35 * 12700 = 444500 EMU)
      sheet.addImage(imageId, {
        tl: { col: 1, row: rowNumber - 1, offsetY: 444500 },
        ext: { width: 160, height: 40 },
      });

      // Высота строки: достаточно для трёх строк текста + штрихкода
      sheet.getRow(rowNumber).height = 80;
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

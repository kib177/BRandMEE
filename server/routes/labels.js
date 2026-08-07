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

      // Записываем три строки
      const row1 = sheet.addRow([article, article]);
      const row2 = sheet.addRow([codeLine, codeLine]);
      const row3 = sheet.addRow([name, '']);  // в правой ячейке B будет штрихкод

      // Стилизуем ячейки
      [row1, row2, row3].forEach(r => {
        r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
        r.height = 20; // базовая высота строки
      });

      // Объединяем ячейки B1:B3 для штрихкода (чтобы он был на всю высоту)
      sheet.mergeCells(`B${row1.number}:B${row3.number}`);

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

      // Вставляем изображение в ячейку B (объединённая область)
      sheet.addImage(imageId, {
        tl: { col: 1, row: row1.number - 1 },  // col 1 = B, row начала
        ext: { width: 150, height: 60 },       // растягиваем на высоту трёх строк
      });

      // Устанавливаем высоту строк, чтобы соответствовать высоте изображения
      row1.height = 25;
      row2.height = 25;
      row3.height = 25;
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

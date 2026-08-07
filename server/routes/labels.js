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

    // Ширина колонок (примерно 70 мм)
    sheet.getColumn(1).width = 35;
    sheet.getColumn(2).width = 35;

    let currentRow = 2; // начинаем со 2-й строки

    for (const item of rows) {
      const article = item.model || item.code;
      const codeLine = `Код материала: S${item.code}`;
      const name = item.name;

      // Левая колонка (A)
      sheet.getCell(`A${currentRow}`).value = article;         // A2 – артикул
      sheet.getCell(`A${currentRow + 1}`).value = codeLine;    // A3 – код материала
      sheet.getCell(`A${currentRow + 2}`).value = name;        // A4 – название

      // Правая колонка (B)
      sheet.getCell(`B${currentRow}`).value = article;         // B2 – артикул
      sheet.getCell(`B${currentRow + 1}`).value = codeLine;    // B3 – код материала

      // Базовое форматирование
      for (let r = 0; r < 3; r++) {
        const leftCell = sheet.getCell(`A${currentRow + r}`);
        const rightCell = sheet.getCell(`B${currentRow + r}`);
        leftCell.font = { size: 9 };
        leftCell.alignment = { wrapText: true, vertical: 'top' };
        rightCell.font = { size: 9 };
        rightCell.alignment = { wrapText: true, vertical: 'top' };
      }

      // Генерируем штрихкод Code 128
      const pngBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: item.code,
        scale: 3,
        height: 10,
        includetext: false,
        textxalign: 'center',
      });

      const imageId = workbook.addImage({
        buffer: pngBuffer,
        extension: 'png',
      });

      // Вставляем штрихкод в B4 (строка currentRow + 2 в Excel, row = currentRow + 1 в терминах ExcelJS)
      sheet.addImage(imageId, {
        tl: { col: 1, row: currentRow + 1 }, // col 1 = B, row отсчитывается от 0
        ext: { width: 160, height: 40 },
      });

      // Высота строк
      sheet.getRow(currentRow).height = 22;
      sheet.getRow(currentRow + 1).height = 22;
      sheet.getRow(currentRow + 2).height = 50; // достаточно для штрихкода

      currentRow += 4; // следующая наклейка через одну пустую строку
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

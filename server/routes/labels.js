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

    // Стили для текста
    const headerStyle = {
      font: { bold: true, size: 10 },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
    };

    const nameStyle = {
      font: { bold: true, size: 14 },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
    };

    for (const row of rows) {
      const article = String(row.model || row.code);
      const codeLine = `Код материала: S${row.code}`;
      const name = String(row.name || '');

      // Строка 1: Артикул
      const row1 = sheet.addRow([article, article]);
      row1.height = 15;
      row1.getCell(1).font = headerStyle.font;
      row1.getCell(1).alignment = headerStyle.alignment;
      row1.getCell(2).font = headerStyle.font;
      row1.getCell(2).alignment = headerStyle.alignment;

      // Строка 2: Код материала
      const row2 = sheet.addRow([codeLine, codeLine]);
      row2.height = 15;
      row2.getCell(1).font = headerStyle.font;
      row2.getCell(1).alignment = headerStyle.alignment;
      row2.getCell(2).font = headerStyle.font;
      row2.getCell(2).alignment = headerStyle.alignment;

      // Строка 3: Название + штрихкод
      const row3 = sheet.addRow([name, '']);
      row3.height = 90;
      row3.getCell(1).font = nameStyle.font;   // шрифт 14
      row3.getCell(1).alignment = nameStyle.alignment;

      // Генерируем штрихкод
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

      // Рассчитываем размеры ячейки B3 в пикселях (приблизительно)
      const colWidth = sheet.getColumn(2).width;   // 36 символов
      const rowHeight = 90;                        // пунктов
      // Переводим в пиксели (примерно)
      const pxWidth = colWidth * 7;    // 36*7 ≈ 252 px
      const pxHeight = rowHeight * 0.75; // 90*0.75 ≈ 67.5 px

      // Изображение штрихкода занимает 90% ширины и высоты ячейки
      const imgWidth = Math.floor(pxWidth * 0.9);
      const imgHeight = Math.floor(pxHeight * 0.9);

      // Вставляем изображение строго в ячейку B3 с центровкой
      sheet.addImage(imageId, {
        tl: { col: 1, row: row3.number - 1 },
        ext: { width: imgWidth, height: imgHeight },
        editAs: 'oneCell',
      });
      row3.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
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

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

    // Создаём книгу Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Наклейки');

    // Настройка колонок (ширина примерно 70 мм каждая)
    sheet.getColumn(1).width = 35;  // левая колонка
    sheet.getColumn(2).width = 35;  // правая колонка

    // Для каждой позиции создаём строку
    for (const row of rows) {
      const leftText = `${row.model || row.code}\n${row.code}\n${row.name}`;
      const rightTextTop = `${row.model || row.code}\n${row.code}`;

      // Добавляем новую строку
      const newRow = sheet.addRow([]);
      const rowNumber = newRow.number;

      // Левая ячейка (A)
      const leftCell = sheet.getCell(`A${rowNumber}`);
      leftCell.value = leftText;
      leftCell.alignment = { wrapText: true, vertical: 'top' };
      leftCell.font = { size: 9 };

      // Правая ячейка (B) – сначала вставляем верхний текст
      const rightCell = sheet.getCell(`B${rowNumber}`);
      rightCell.value = rightTextTop;
      rightCell.alignment = { wrapText: true, vertical: 'top' };
      rightCell.font = { size: 9 };

      // Генерируем штрихкод (PNG)
      const pngBuffer = await bwipjs.toBuffer({
        bcid: 'code128',       // тип штрихкода
        text: row.code,        // данные
        scale: 3,              // масштаб
        height: 10,            // высота в мм
        includetext: false,    // не печатать текст под штрихкодом
        textxalign: 'center',
      });

      // Вставляем изображение штрихкода в правую часть строки (приблизительно под текстом)
      const imageId = workbook.addImage({
        buffer: pngBuffer,
        extension: 'png',
      });

      // Позиционируем картинку в ячейке B (правая колонка)
      sheet.addImage(imageId, {
        tl: { col: 1, row: rowNumber - 1 }, // col 1 = B, row с 0
        ext: { width: 160, height: 40 },     // размеры в пикселях (подбирайте)
      });

      // Увеличиваем высоту строки, чтобы вместить штрихкод
      sheet.getRow(rowNumber).height = 65; // примерно 50 пикселей
    }

    // Отправляем файл
    res.setHeader('Content-Disposition', 'attachment; filename=labels.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Ошибка генерации наклеек:', err);
    res.status(500).json({ error: 'Ошибка генерации наклеек' });
  }
});

// Получить список всех кодов и названий для выбора
router.get('/items', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT code, name FROM inventory ORDER BY code');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки позиций' });
  }
});

module.exports = router;

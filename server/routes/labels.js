const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const XLSX = require('xlsx');

router.post('/generate', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  try {
    let { codes } = req.body; // массив кодов или пустой для всех позиций
    let result;

    if (codes && Array.isArray(codes) && codes.length > 0) {
      // Выбранные позиции
      const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
      result = await pool.query(`
        SELECT code, model, name FROM inventory
        WHERE code IN (${placeholders})
        ORDER BY code
      `, codes);
    } else {
      // Все позиции
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
    const wb = XLSX.utils.book_new();

    // Данные для наклеек: каждая строка – две колонки с одинаковой информацией
    const data = rows.map(row => {
      const leftBlock = `${row.model || row.code}\n${row.code}\n${row.name}`;
      const rightBlock = leftBlock; // или можно добавить QR-код позже
      return {
        'Левая наклейка': leftBlock,
        'Правая наклейка': rightBlock
      };
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: ['Левая наклейка', 'Правая наклейка'] });

    // Настройка ширины столбцов и высоты строк для печати (примерно под размер наклейки 70x37 мм)
    ws['!cols'] = [
      { wpx: 265 }, // ширина левого столбца (примерно 70 мм)
      { wpx: 265 }  // ширина правого столбца
    ];
    // Высота строк будет автоматически подстроена под содержимое

    XLSX.utils.book_append_sheet(wb, ws, 'Наклейки');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=labels.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
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

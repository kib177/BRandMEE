const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// 1. Создание запроса на списание (сотрудник)
router.post('/', (req, res) => {
  try {
    const { item_code, equipment, quantity, requested_by, comment } = req.body;
    if (!item_code || quantity == null || quantity <= 0) {
      return res.status(400).json({ error: 'Код позиции и количество обязательны' });
    }
    // Проверим существование позиции
    const item = db.prepare('SELECT code, name, unit, quantity FROM inventory WHERE code = ?').get(item_code);
    if (!item) return res.status(404).json({ error: 'Позиция с таким кодом не найдена' });

    // *** НОВОЕ *** проверка, что не списывают больше остатка
    if (quantity > item.quantity) {
      return res.status(400).json({ error: `Недостаточно на складе. Доступно: ${item.quantity} ${item.unit}` });
    }

    const stmt = db.prepare(`
      INSERT INTO write_offs (item_code, item_name, equipment, quantity, unit, requested_by, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      item_code,
      item.name,
      equipment || '',
      quantity,
      item.unit,
      requested_by || 'сотрудник',
      comment || ''
    );
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания запроса на списание' });
  }
});

// 2. Получение списка запросов (администратор)
// Поддерживает фильтрацию: ?status=pending&from=2025-01-01&to=2025-12-31&equipment=...
router.get('/', authMiddleware, (req, res) => {
  try {
    let query = 'SELECT * FROM write_offs WHERE 1=1';
    const params = [];

    if (req.query.status) {
      query += ' AND status = ?';
      params.push(req.query.status);
    }
    if (req.query.equipment) {
      query += ' AND equipment LIKE ?';
      params.push(`%${req.query.equipment}%`);
    }
    if (req.query.from) {
      query += ' AND requested_at >= ?';
      params.push(req.query.from);
    }
    if (req.query.to) {
      query += ' AND requested_at <= ?';
      params.push(req.query.to + ' 23:59:59');
    }
    query += ' ORDER BY requested_at DESC';

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения списка списаний' });
  }
});

// 3. Изменение статуса (подтверждение/отклонение) – администратор
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' или 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Статус может быть только approved или rejected' });
    }

    const writeOff = db.prepare('SELECT * FROM write_offs WHERE id = ?').get(req.params.id);
    if (!writeOff) return res.status(404).json({ error: 'Запрос не найден' });
    if (writeOff.status !== 'pending') {
      return res.status(400).json({ error: 'Можно изменить только ожидающие запросы' });
    }

    // Если подтверждаем – уменьшаем остаток
    if (status === 'approved') {
      const item = db.prepare('SELECT quantity FROM inventory WHERE code = ?').get(writeOff.item_code);
      if (!item) return res.status(400).json({ error: 'Позиция на складе уже удалена' });
      if (item.quantity < writeOff.quantity) {
        return res.status(400).json({ error: `Недостаточно на складе. Доступно: ${item.quantity}` });
      }

      const updateInventory = db.prepare('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?');
      const updateStatus = db.prepare('UPDATE write_offs SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?');

      const transaction = db.transaction(() => {
        updateInventory.run(writeOff.quantity, writeOff.item_code);
        updateStatus.run(status, req.params.id);
      });
      transaction();
    } else {
      // rejected – просто меняем статус
      db.prepare('UPDATE write_offs SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обработки списания' });
  }
});

// 4. Отчётность за год (суммы по месяцам или детальный список)
router.get('/report', authMiddleware, (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    // Пример: суммарное количество списанных единиц по месяцам
    const rows = db.prepare(`
      SELECT strftime('%m', requested_at) AS month,
             SUM(quantity) AS total_quantity,
             COUNT(*) AS count_requests
      FROM write_offs
      WHERE status = 'approved'
        AND strftime('%Y', requested_at) = ?
      GROUP BY month
      ORDER BY month
    `).all(String(year));

    // Также можно добавить разбивку по оборудованию
    const byEquipment = db.prepare(`
      SELECT equipment, SUM(quantity) AS total_quantity, COUNT(*) AS count_requests
      FROM write_offs
      WHERE status = 'approved' AND strftime('%Y', requested_at) = ?
      GROUP BY equipment
      ORDER BY total_quantity DESC
    `).all(String(year));

    res.json({ year, monthly: rows, byEquipment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка формирования отчёта' });
  }
});

module.exports = router;

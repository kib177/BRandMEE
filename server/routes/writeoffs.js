const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Создание заявки (сотрудник)
router.post('/', (req, res) => {
  try {
    const { item_code, equipment_id, quantity, requested_by, comment } = req.body;
    if (!item_code || quantity == null || quantity <= 0) {
      return res.status(400).json({ error: 'Код позиции и количество обязательны' });
    }
    const item = db.prepare('SELECT code, name, unit, quantity FROM inventory WHERE code = ?').get(item_code);
    if (!item) return res.status(404).json({ error: 'Позиция с таким кодом не найдена' });
    if (quantity > item.quantity) {
      return res.status(400).json({ error: `Недостаточно на складе. Доступно: ${item.quantity} ${item.unit}` });
    }

    const stmt = db.prepare(`
      INSERT INTO write_offs (item_code, item_name, equipment_id, quantity, unit, requested_by, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(item_code, item.name, equipment_id || null, quantity, item.unit, requested_by || 'сотрудник', comment || '');
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания запроса на списание' });
  }
});

// Получение списка (админ)
router.get('/', authMiddleware, requireRole('admin'), (req, res) => {
  try {
   let query = `SELECT wo.*, eq.name AS equipment_name, i.model AS model
             FROM write_offs wo
             LEFT JOIN equipment eq ON wo.equipment_id = eq.id
             LEFT JOIN inventory i ON wo.item_code = i.code
             WHERE 1=1`;
    const params = [];

    if (req.query.status) {
      query += ' AND status = ?';
      params.push(req.query.status);
    }
    if (req.query.equipment) {
      query += ' AND eq.name LIKE ?';
      params.push(`%${req.query.equipment}%`);
    }
    if (req.query.from) {
      query += ' AND wo.requested_at >= ?';
      params.push(req.query.from);
    }
    if (req.query.to) {
      query += ' AND wo.requested_at <= ?';
      params.push(req.query.to + ' 23:59:59');
    }
    query += ' ORDER BY wo.requested_at DESC';

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения списка списаний' });
  }
});

// Изменение статуса (админ)
router.patch('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Статус может быть только approved или rejected' });
    }

    const writeOff = db.prepare('SELECT * FROM write_offs WHERE id = ?').get(req.params.id);
    if (!writeOff) return res.status(404).json({ error: 'Запрос не найден' });
    if (writeOff.status !== 'pending') {
      return res.status(400).json({ error: 'Можно изменить только ожидающие запросы' });
    }

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
      // rejected
      db.prepare('UPDATE write_offs SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка обработки списания:', err);
    res.status(500).json({ error: 'Ошибка обработки списания' });
  }
});

// Отчёт
router.get('/report', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();

    // Агрегация по месяцам
    const monthly = db.prepare(`
      SELECT strftime('%m', requested_at) AS month,
             SUM(quantity) AS total_quantity,
             COUNT(*) AS count_requests
      FROM write_offs
      WHERE status = 'approved'
        AND strftime('%Y', requested_at) = ?
      GROUP BY month
      ORDER BY month
    `).all(String(year));

    // Агрегация по оборудованию
    const byEquipment = db.prepare(`
      SELECT eq.name AS equipment, SUM(wo.quantity) AS total_quantity, COUNT(*) AS count_requests
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      WHERE wo.status = 'approved' AND strftime('%Y', wo.requested_at) = ?
      GROUP BY eq.name
      ORDER BY total_quantity DESC
    `).all(String(year));

    // Полная детализация за год (включая артикул)
    const details = db.prepare(`
      SELECT wo.id, wo.item_code, wo.item_name, wo.quantity, wo.unit,
             eq.name AS equipment_name,
             i.model AS model,
             wo.requested_by,
             wo.requested_at,
             wo.status,
             wo.resolved_at,
             wo.comment
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      LEFT JOIN inventory i ON wo.item_code = i.code
      WHERE strftime('%Y', wo.requested_at) = ?
      ORDER BY wo.requested_at DESC
    `).all(String(year));

    res.json({ year, monthly, byEquipment, details });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка формирования отчёта' });
  }
});
});
module.exports = router;

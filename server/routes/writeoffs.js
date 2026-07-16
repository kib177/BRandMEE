const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendMail } = require('../mailer');
const { logAction } = require('../log/logger');

// Создание заявки (сотрудник)
router.post('/', async (req, res) => {
  try {
    const { item_code, equipment_id, quantity, requested_by, comment } = req.body;
    if (!item_code || quantity == null || quantity <= 0) {
      return res.status(400).json({ error: 'Код позиции и количество обязательны' });
    }

    // Находим позицию по коду (учитывая отдел? пока без отдела, просто ищем первый попавшийся)
    const itemRes = await pool.query('SELECT code, name, unit, quantity FROM inventory WHERE code = $1 LIMIT 1', [item_code]);
    const item = itemRes.rows[0];
    if (!item) return res.status(404).json({ error: 'Позиция с таким кодом не найдена' });
    if (quantity > item.quantity) {
      return res.status(400).json({ error: `Недостаточно на складе. Доступно: ${item.quantity} ${item.unit}` });
    }

    // Вставляем заявку (department_id пока 1)
    const result = await pool.query(`
      INSERT INTO write_offs (item_code, department_id, item_name, equipment_id, quantity, unit, requested_by, comment)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [item_code, 1, item.name, equipment_id || null, quantity, item.unit, requested_by || 'сотрудник', comment || '']);

    const newId = result.rows[0].id;

    // Отправляем уведомления (асинхронно)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (adminEmails.length > 0) {
      const equipRes = equipment_id ? await pool.query('SELECT name FROM equipment WHERE id = $1', [equipment_id]) : { rows: [] };
      const equipmentName = equipRes.rows[0]?.name || 'не указано';
      const mailHtml = `
        <h3>Новая заявка на списание</h3>
        <table border="1" cellpadding="5" style="border-collapse:collapse;">
          <tr><td><b>Код</b></td><td>${item_code}</td></tr>
          <tr><td><b>Наименование</b></td><td>${item.name}</td></tr>
          <tr><td><b>Количество</b></td><td>${quantity} ${item.unit}</td></tr>
          <tr><td><b>Оборудование</b></td><td>${equipmentName}</td></tr>
          <tr><td><b>Запросил</b></td><td>${requested_by || 'сотрудник'}</td></tr>
          <tr><td><b>Комментарий</b></td><td>${comment || '—'}</td></tr>
        </table>
        <p>Перейти в <a href="${process.env.APP_URL || 'https://brandmee.site'}/admin-writeoffs.html">админ-панель</a></p>
      `;
      sendMail({
        to: adminEmails.join(','),
        subject: `Новая заявка на списание: ${item.name}`,
        html: mailHtml
      }).catch(err => console.error('Ошибка отправки уведомления:', err));
    }

    res.json({ ok: true, id: newId });
    
    logAction({
    user: { id: req.user?.id || null, username: requested_by, role: req.user?.role || 'user' },
    action: 'create_writeoff',
    entityType: 'write_off',
    entityId: result.rows[0].id.toString(),
    details: { item_code, quantity, equipment_id },
    req
}).catch(() => {});
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания запроса на списание' });
  }
});

// Получение списка (админ)
router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    let query = `
      SELECT wo.*, eq.name AS equipment_name, i.model AS model
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      LEFT JOIN inventory i ON wo.item_code = i.code AND wo.department_id = i.department_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (req.query.status) {
      query += ` AND wo.status = $${paramIndex++}`;
      params.push(req.query.status);
    }
    if (req.query.equipment) {
      query += ` AND eq.name ILIKE $${paramIndex++}`;
      params.push(`%${req.query.equipment}%`);
    }
    if (req.query.from) {
      query += ` AND wo.requested_at >= $${paramIndex++}`;
      params.push(req.query.from);
    }
    if (req.query.to) {
      query += ` AND wo.requested_at <= $${paramIndex++}`;
      params.push(req.query.to + ' 23:59:59');
    }
    query += ' ORDER BY wo.requested_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения списка списаний' });
  }
});

// Изменение статуса (админ)
router.patch('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Статус может быть только approved или rejected' });
    }

    const woRes = await pool.query('SELECT * FROM write_offs WHERE id = $1', [req.params.id]);
    const writeOff = woRes.rows[0];
    if (!writeOff) return res.status(404).json({ error: 'Запрос не найден' });
    if (writeOff.status !== 'pending') {
      return res.status(400).json({ error: 'Можно изменить только ожидающие запросы' });
    }

    if (status === 'approved') {
      // Проверяем наличие на складе
      const itemRes = await pool.query('SELECT quantity FROM inventory WHERE code = $1 AND department_id = $2', [writeOff.item_code, writeOff.department_id]);
      if (itemRes.rows.length === 0) return res.status(400).json({ error: 'Позиция на складе уже удалена' });
      const item = itemRes.rows[0];
      if (item.quantity < writeOff.quantity) {
        return res.status(400).json({ error: `Недостаточно на складе. Доступно: ${item.quantity}` });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE code = $2 AND department_id = $3',
          [writeOff.quantity, writeOff.item_code, writeOff.department_id]);
        await client.query('UPDATE write_offs SET status = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      await pool.query('UPDATE write_offs SET status = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
    }

    res.json({ ok: true });
    
    logAction({
    user: req.user,
    action: status === 'approved' ? 'approve_writeoff' : 'reject_writeoff',
    entityType: 'write_off',
    entityId: req.params.id,
    details: { status },
    req
      
}).catch(() => {});
  } catch (err) {
    console.error('Ошибка обработки списания:', err);
    res.status(500).json({ error: 'Ошибка обработки списания' });
  }
});

// Отчёт
router.get('/report', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    // Здесь SQL-запросы с параметрами; для краткости используем pg
    const monthly = await pool.query(`
      SELECT EXTRACT(MONTH FROM requested_at) as month,
             SUM(quantity) as total_quantity,
             COUNT(*) as count_requests
      FROM write_offs
      WHERE status = 'approved' AND EXTRACT(YEAR FROM requested_at) = $1
      GROUP BY month
      ORDER BY month
    `, [year]);

    const byEquipment = await pool.query(`
      SELECT eq.name AS equipment, SUM(wo.quantity) AS total_quantity, COUNT(*) AS count_requests
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      WHERE wo.status = 'approved' AND EXTRACT(YEAR FROM wo.requested_at) = $1
      GROUP BY eq.name
      ORDER BY total_quantity DESC
    `, [year]);

    const details = await pool.query(`
      SELECT wo.id, wo.item_code, wo.item_name, wo.quantity, wo.unit,
             eq.name AS equipment_name, i.model AS model,
             wo.requested_by, wo.requested_at, wo.status, wo.resolved_at, wo.comment
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      LEFT JOIN inventory i ON wo.item_code = i.code AND wo.department_id = i.department_id
      WHERE EXTRACT(YEAR FROM wo.requested_at) = $1
      ORDER BY wo.requested_at DESC
    `, [year]);

    res.json({ year, monthly: monthly.rows, byEquipment: byEquipment.rows, details: details.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка формирования отчёта' });
  }
});

module.exports = router;

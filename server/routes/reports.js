const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ---------- РАСШИРЕННЫЙ ОТЧЁТ ПО СПИСАНИЯМ (без расходников) ----------
router.get('/writeoffs-extended', authMiddleware, requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
  try {
    const { from, to, department_id, status } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Укажите from и to' });
    }

    let deptCondition = '';
    let statusCondition = '';
    const params = [from, to];

    // Условие по отделу
    if (req.user.role !== 'admin') {
      deptCondition = ' AND wo.department_id = $3';
      params.push(req.user.department_id);
    } else if (department_id) {
      deptCondition = ' AND wo.department_id = $3';
      params.push(department_id);
    }

    // Условие по статусу
    if (status) {
      statusCondition = ' AND wo.status = $' + (params.length + 1);
      params.push(status);
    }

    // Условие исключения расходников
    const excludeConsumables = `
      AND NOT EXISTS (
        SELECT 1 FROM inventory i
        JOIN part_types pt ON i.type_id = pt.id
        WHERE i.code = wo.item_code AND pt.name = 'Расходник'
      )
    `;

    // 1. Метрики
    const metricsRes = await pool.query(`
      SELECT COUNT(*) AS total_count,
             COALESCE(SUM(quantity), 0) AS total_qty,
             COALESCE(AVG(quantity), 0) AS avg_per_day
      FROM write_offs wo
      WHERE wo.requested_at >= $1
        AND wo.requested_at <= ($2::date + interval '1 day')
        ${deptCondition} ${statusCondition}
        ${excludeConsumables}
    `, params);
    const metrics = metricsRes.rows[0] || { total_count: 0, total_qty: 0, avg_per_day: 0 };

    // 2. По месяцам
    const monthly = await pool.query(`
      SELECT TO_CHAR(wo.requested_at, 'YYYY-MM') AS month,
             COUNT(*) AS count,
             SUM(wo.quantity) AS total_qty
      FROM write_offs wo
      WHERE wo.requested_at >= $1
        AND wo.requested_at <= ($2::date + interval '1 day')
        ${deptCondition} ${statusCondition}
        ${excludeConsumables}
      GROUP BY month
      ORDER BY month
    `, params);

    // 3. По дням
    const byDay = await pool.query(`
      SELECT TO_CHAR(wo.requested_at, 'DD.MM.YYYY') AS day,
             COUNT(*) AS count,
             SUM(wo.quantity) AS total_qty
      FROM write_offs wo
      WHERE wo.requested_at >= $1
        AND wo.requested_at <= ($2::date + interval '1 day')
        ${deptCondition} ${statusCondition}
        ${excludeConsumables}
      GROUP BY day
      ORDER BY day
    `, params);

    // 4. Топ позиций
    const topItems = await pool.query(`
      SELECT wo.item_code, wo.item_name, SUM(wo.quantity) AS total_qty, COUNT(*) AS count
      FROM write_offs wo
      WHERE wo.requested_at >= $1
        AND wo.requested_at <= ($2::date + interval '1 day')
        ${deptCondition} ${statusCondition}
        ${excludeConsumables}
      GROUP BY wo.item_code, wo.item_name
      ORDER BY total_qty DESC
      LIMIT 10
    `, params);

    // 5. По оборудованию
    const byEquipment = await pool.query(`
      SELECT eq.name AS equipment, SUM(wo.quantity) AS total_qty, COUNT(*) AS count
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      WHERE wo.requested_at >= $1
        AND wo.requested_at <= ($2::date + interval '1 day')
        ${deptCondition} ${statusCondition}
        ${excludeConsumables}
      GROUP BY eq.name
      ORDER BY total_qty DESC
    `, params);

    // 6. По статусам (с исключением расходников)
    const byStatus = await pool.query(`
      SELECT wo.status, COUNT(*) AS count
      FROM write_offs wo
      WHERE wo.requested_at >= $1
        AND wo.requested_at <= ($2::date + interval '1 day')
        ${deptCondition}
        AND NOT EXISTS (
          SELECT 1 FROM inventory i
          JOIN part_types pt ON i.type_id = pt.id
          WHERE i.code = wo.item_code AND pt.name = 'Расходник'
        )
      GROUP BY wo.status
    `, params);

    // 7. Детализация (для таблицы на странице)
    const details = await pool.query(`
      SELECT wo.id, wo.requested_at, wo.item_code, wo.item_name,
             wo.quantity, eq.name AS equipment_name, wo.status
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      WHERE wo.requested_at >= $1
        AND wo.requested_at <= ($2::date + interval '1 day')
        ${deptCondition} ${statusCondition}
        ${excludeConsumables}
      ORDER BY wo.requested_at DESC
    `, params);

    res.json({
      metrics,
      monthly: monthly.rows,
      byDay: byDay.rows,
      topItems: topItems.rows,
      byEquipment: byEquipment.rows,
      byStatus: byStatus.rows,
      details: details.rows
    });

  } catch (err) {
    console.error('Ошибка получения расширенного отчёта:', err);
    res.status(500).json({ error: 'Ошибка получения расширенного отчёта' });
  }
});

module.exports = router;

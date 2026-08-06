const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ---------- РАСШИРЕННЫЙ ОТЧЁТ ПО СПИСАНИЯМ ----------
router.get('/writeoffs-extended', authMiddleware, requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Укажите from и to в формате YYYY-MM-DD' });
    }

    // Ограничение по отделу для не-админов
    let deptCondition = '';
    let deptParams = [];
    if (req.user.role !== 'admin') {
      deptCondition = ' AND wo.department_id = $3';
      deptParams = [req.user.department_id];
    }

    // 1. По месяцам (количество и сумма заявок)
    const monthly = await pool.query(`
      SELECT TO_CHAR(requested_at, 'YYYY-MM') AS month,
             COUNT(*) AS count,
             SUM(quantity) AS total_qty
      FROM write_offs wo
      WHERE status = 'approved' AND requested_at >= $1 AND requested_at <= ($2::date + interval '1 day')
      ${deptCondition}
      GROUP BY month
      ORDER BY month
    `, [from, to, ...deptParams]);

    // 2. Топ позиций (по убыванию количества)
    const topItems = await pool.query(`
      SELECT item_code, item_name, SUM(quantity) AS total_qty, COUNT(*) AS count
      FROM write_offs wo
      WHERE status = 'approved' AND requested_at >= $1 AND requested_at <= ($2::date + interval '1 day')
      ${deptCondition}
      GROUP BY item_code, item_name
      ORDER BY total_qty DESC
      LIMIT 20
    `, [from, to, ...deptParams]);

    // 3. По оборудованию
    const byEquipment = await pool.query(`
      SELECT eq.name AS equipment, SUM(wo.quantity) AS total_qty, COUNT(*) AS count
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      WHERE wo.status = 'approved' AND wo.requested_at >= $1 AND wo.requested_at <= ($2::date + interval '1 day')
      ${deptCondition}
      GROUP BY eq.name
      ORDER BY total_qty DESC
    `, [from, to, ...deptParams]);

    res.json({
      monthly: monthly.rows,
      topItems: topItems.rows,
      byEquipment: byEquipment.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения расширенного отчёта' });
  }
});

// ---------- ОБОРОТНАЯ ВЕДОМОСТЬ ----------
router.get('/turnover', authMiddleware, requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Укажите from и to в формате YYYY-MM-DD' });
    }

    let deptCondition = '';
    let deptParams = [];
    if (req.user.role !== 'admin') {
      deptCondition = ' AND i.department_id = $3';
      deptParams = [req.user.department_id];
    }

    // Все позиции с остатком на начало периода, приходом и расходом за период
    const query = `
      WITH period_writeoffs AS (
        SELECT item_code, SUM(quantity) AS total_writeoff
        FROM write_offs
        WHERE status = 'approved' AND requested_at >= $1 AND requested_at <= ($2::date + interval '1 day')
        GROUP BY item_code
      ),
      period_restocks AS (
        -- Приход = все позиции, у которых дата в inventory попадает в период (упрощённо)
        SELECT code, SUM(quantity) AS total_restock
        FROM inventory i
        WHERE date >= $1::text AND date <= $2::text
        ${deptCondition}
        GROUP BY code
      )
      SELECT i.code, i.name, i.unit,
             COALESCE(pr.total_restock, 0) AS restock,
             COALESCE(pw.total_writeoff, 0) AS writeoff,
             i.quantity AS current_stock
      FROM inventory i
      LEFT JOIN period_writeoffs pw ON i.code = pw.item_code
      LEFT JOIN period_restocks pr ON i.code = pr.code
      WHERE 1=1 ${deptCondition}
      ORDER BY i.code
    `;
    const params = [from, to, ...deptParams];
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения оборотной ведомости' });
  }
});

module.exports = router;

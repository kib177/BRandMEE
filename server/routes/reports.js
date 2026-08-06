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

    let deptCondition = '';
    let deptParams = [];
    if (req.user.role !== 'admin') {
      deptCondition = ' AND wo.department_id = $3';
      deptParams.push(req.user.department_id);
    }

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

    const topItems = await pool.query(`
      SELECT item_code, item_name, SUM(quantity) AS total_qty, COUNT(*) AS count
      FROM write_offs wo
      WHERE status = 'approved' AND requested_at >= $1 AND requested_at <= ($2::date + interval '1 day')
      ${deptCondition}
      GROUP BY item_code, item_name
      ORDER BY total_qty DESC
      LIMIT 20
    `, [from, to, ...deptParams]);

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

module.exports = router;

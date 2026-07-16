const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        let query = `SELECT * FROM audit_log WHERE 1=1`;
        const params = [];

        if (req.query.user) {
            query += ` AND username ILIKE $${params.length + 1}`;
            params.push(`%${req.query.user}%`);
        }
        if (req.query.action) {
            query += ` AND action = $${params.length + 1}`;
            params.push(req.query.action);
        }

        query += ` ORDER BY created_at DESC LIMIT 200`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения логов' });
    }
});

module.exports = router;

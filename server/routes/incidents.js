const express = require('express');
const router = express.Router();
const pool = require('../db');
const {authMiddleware, requireRole} = require('../middleware/auth');

// Просмотр доступен всем авторизованным
router.use(authMiddleware);

// GET /api/incidents?equipment_id=...&status=...&search=...
router.get('/', async (req, res) => {
    try {
        const {equipment_id, status, search} = req.query;
        let query = `
            SELECT ei.*,
                   e.name                                AS equipment_name,
                   COALESCE(COUNT(ip.inventory_code), 0) AS parts_count
            FROM equipment_incidents ei
                     LEFT JOIN equipment e ON ei.equipment_id = e.id
                     LEFT JOIN incident_parts ip ON ip.incident_id = ei.id
            WHERE 1 = 1
        `;
        const params = [];

        if (equipment_id) {
            query += ' AND ei.equipment_id = $' + (params.length + 1);
            params.push(equipment_id);
        }
        if (status) {
            query += ' AND ei.status = $' + (params.length + 1);
            params.push(status);
        }
        if (search) {
            query += ' AND (ei.title ILIKE $' + (params.length + 1) + ' OR ei.description ILIKE $' + (params.length + 1) + ')';
            params.push('%' + search + '%');
        }

        query += ' GROUP BY ei.id, e.name ORDER BY ei.reported_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения инцидентов:', err);
        res.status(500).json({error: 'Ошибка получения инцидентов'});
    }
});

// GET /api/incidents/stats – аналитика
router.get('/stats', async (req, res) => {
    try {
        const topEquipment = await pool.query(`
            SELECT e.name, COUNT(ei.id) AS incident_count
            FROM equipment_incidents ei
                     JOIN equipment e ON ei.equipment_id = e.id
            GROUP BY e.name
            ORDER BY incident_count DESC LIMIT 10
        `);

        const topParts = await pool.query(`
            SELECT i.name, SUM(ip.quantity) AS total_qty
            FROM incident_parts ip
                     JOIN inventory i ON ip.inventory_code = i.code AND ip.department_id = i.department_id
            GROUP BY i.name
            ORDER BY total_qty DESC LIMIT 10
        `);

        const byStatus = await pool.query(`
            SELECT status, COUNT(*) AS count
            FROM equipment_incidents
            GROUP BY status
        `);

        res.json({
            topEquipment: topEquipment.rows,
            topParts: topParts.rows,
            byStatus: byStatus.rows
        });
    } catch (err) {
        console.error('Ошибка получения статистики:', err);
        res.status(500).json({error: 'Ошибка получения статистики'});
    }
});

// GET /api/incidents/:id – подробности с запчастями
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const incidentRes = await pool.query(`
            SELECT ei.*, e.name AS equipment_name
            FROM equipment_incidents ei
                     JOIN equipment e ON ei.equipment_id = e.id
            WHERE ei.id = $1
        `, [id]);

        if (incidentRes.rows.length === 0) {
            return res.status(404).json({error: 'Инцидент не найден'});
        }

        const partsRes = await pool.query(`
            SELECT ip.inventory_code, ip.department_id, ip.quantity, ip.unit, i.name, i.model
            FROM incident_parts ip
                     JOIN inventory i ON ip.inventory_code = i.code AND ip.department_id = i.department_id
            WHERE ip.incident_id = $1
        `, [id]);

        const incident = incidentRes.rows[0];
        incident.parts = partsRes.rows;

        res.json(incident);
    } catch (err) {
        console.error('Ошибка получения инцидента:', err);
        res.status(500).json({error: 'Ошибка получения инцидента'});
    }
});

// POST /api/incidents – создание (роли: admin, moderator, storekeeper)
router.post('/', requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
    try {
        const {equipment_id, title, description, root_cause, solution, status, parts} = req.body;
        if (!equipment_id || !title) {
            return res.status(400).json({error: 'equipment_id и title обязательны'});
        }

        // Проверяем оборудование
        const eqRes = await pool.query('SELECT id FROM equipment WHERE id = $1', [equipment_id]);
        if (eqRes.rows.length === 0) {
            return res.status(404).json({error: 'Оборудование не найдено'});
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const incResult = await client.query(`
                INSERT INTO equipment_incidents (equipment_id, title, description, root_cause, solution, status,
                                                 reported_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
            `, [equipment_id, title, description || null, root_cause || null, solution || null, status || 'open', req.user.id]);

            const incidentId = incResult.rows[0].id;

            // Добавляем запчасти, если переданы (массив кодов)
            if (parts && Array.isArray(parts)) {
                for (const partCode of parts) {
                    const invRes = await client.query('SELECT code, department_id, unit FROM inventory WHERE code = $1 LIMIT 1', [partCode]);
                    if (invRes.rows.length > 0) {
                        const inv = invRes.rows[0];
                        await client.query(`
                            INSERT INTO incident_parts (incident_id, inventory_code, department_id, quantity, unit)
                            VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
                        `, [incidentId, inv.code, inv.department_id, 1, inv.unit]);
                    }
                }
            }

            await client.query('COMMIT');
            res.json({ok: true, id: incidentId});
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Ошибка создания инцидента:', err);
        res.status(500).json({error: 'Ошибка создания инцидента'});
    }
});

// PATCH /api/incidents/:id – обновление
router.patch('/:id', requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
    try {
        const id = req.params.id;
        const {title, description, root_cause, solution, status, resolved_at} = req.body;

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (title !== undefined) {
            updates.push(`title = $${paramCount++}`);
            values.push(title);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }
        if (root_cause !== undefined) {
            updates.push(`root_cause = $${paramCount++}`);
            values.push(root_cause);
        }
        if (solution !== undefined) {
            updates.push(`solution = $${paramCount++}`);
            values.push(solution);
        }
        if (status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            values.push(status);
            if (status === 'closed' || status === 'resolved') {
                updates.push(`resolved_at = $${paramCount++}`);
                values.push(new Date().toISOString());
            } else {
                updates.push(`resolved_at = NULL`);
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({error: 'Нет данных для обновления'});
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        await pool.query(`UPDATE equipment_incidents
                          SET ${updates.join(', ')}
                          WHERE id = $${paramCount}`, values);

        res.json({ok: true});
    } catch (err) {
        console.error('Ошибка обновления инцидента:', err);
        res.status(500).json({error: 'Ошибка обновления инцидента'});
    }
});

// DELETE /api/incidents/:id – только админ
router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM equipment_incidents WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({error: 'Инцидент не найден'});
        }
        res.json({ok: true});
    } catch (err) {
        console.error('Ошибка удаления инцидента:', err);
        res.status(500).json({error: 'Ошибка удаления инцидента'});
    }
});

module.exports = router;

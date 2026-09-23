const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendMail } = require('../mailer');

// ---------- Загрузка файлов ----------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', '..', 'public', 'uploads', 'purchases');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, 'pr-' + unique + ext);
    }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authMiddleware);

// ---------- Уведомление админов о новой заявке ----------
async function notifyAdmins(request) {
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    if (adminEmails.length === 0) return;

    const userRes = await pool.query(
        'SELECT username, display_name FROM users WHERE id = $1',
        [request.requested_by]
    );
    const userName = userRes.rows[0]?.display_name
        || userRes.rows[0]?.username || 'Неизвестный';

    const html = `
        <h3>Новая заявка на закупку #${request.id}</h3>
        <p><b>От:</b> ${userName}</p>
        <p><b>Наименование:</b> ${request.item_name}</p>
        <p><b>Количество:</b> ${request.quantity} ${request.unit}</p>
        <p><b>Приоритет:</b> ${request.priority || 'обычный'}</p>
        <p><b>Обоснование:</b> ${request.justification || '—'}</p>
        <p><a href="${process.env.APP_URL || 'https://brandmee.site'}/purchases-admin.html">Открыть в системе</a></p>
    `;
    sendMail({
        to: adminEmails.join(','),
        subject: `Новая заявка на закупку #${request.id}: ${request.item_name}`,
        html
    }).catch(err => console.error('Ошибка email:', err.message));
}

// ---------- GET /api/purchases ----------
router.get('/', async (req, res) => {
    try {
        const { status, department_id, search, from, to } = req.query;
        let query = `
            SELECT pr.*,
                   u.username AS requested_by_username,
                   u.display_name AS requested_by_name,
                   d.name AS department_name,
                   e.name AS equipment_name,
                   ru.username AS resolved_by_username,
                   ru.display_name AS resolved_by_name
            FROM purchase_requests pr
            LEFT JOIN users u  ON pr.requested_by = u.id
            LEFT JOIN users ru ON pr.resolved_by  = ru.id
            LEFT JOIN departments d ON pr.department_id = d.id
            LEFT JOIN equipment e   ON pr.equipment_id  = e.id
            WHERE 1=1
        `;
        const params = [];

        // Обычный пользователь видит только свои заявки
        if (req.user.role === 'user') {
            query += ` AND pr.requested_by = $${params.length + 1}`;
            params.push(req.user.id);
        }
        if (status) {
            query += ` AND pr.status = $${params.length + 1}`;
            params.push(status);
        }
        if (department_id) {
            query += ` AND pr.department_id = $${params.length + 1}`;
            params.push(department_id);
        }
        if (from) {
            query += ` AND pr.created_at >= $${params.length + 1}`;
            params.push(from);
        }
        if (to) {
            query += ` AND pr.created_at <= $${params.length + 1}`;
            params.push(to + ' 23:59:59');
        }
        if (search) {
            query += ` AND (pr.item_name ILIKE $${params.length + 1}
                        OR pr.justification ILIKE $${params.length + 1}
                        OR pr.supplier ILIKE $${params.length + 1})`;
            params.push(`%${search}%`);
        }

        query += ' ORDER BY pr.created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения заявок:', err);
        res.status(500).json({ error: 'Ошибка получения заявок' });
    }
});

// ---------- GET /api/purchases/summary (сводка) ----------
router.get('/summary', async (req, res) => {
    try {
        const baseWhere = req.user.role === 'user' ? 'WHERE requested_by = $1' : '';
        const baseParams = req.user.role === 'user' ? [req.user.id] : [];

        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending')     AS pending,
                COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
                COUNT(*) FILTER (WHERE status = 'approved')    AS approved,
                COUNT(*) FILTER (WHERE status = 'done')        AS done,
                COUNT(*) FILTER (WHERE status = 'rejected')    AS rejected,
                COUNT(*) AS total
            FROM purchase_requests
            ${baseWhere}
        `, baseParams);

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка сводки:', err);
        res.status(500).json({ error: 'Ошибка сводки' });
    }
});

// ---------- GET /api/purchases/:id ----------
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT pr.*,
                   u.username AS requested_by_username,
                   u.display_name AS requested_by_name,
                   d.name AS department_name,
                   e.name AS equipment_name,
                   ru.username AS resolved_by_username,
                   ru.display_name AS resolved_by_name
            FROM purchase_requests pr
            LEFT JOIN users u  ON pr.requested_by = u.id
            LEFT JOIN users ru ON pr.resolved_by  = ru.id
            LEFT JOIN departments d ON pr.department_id = d.id
            LEFT JOIN equipment e   ON pr.equipment_id  = e.id
            WHERE pr.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        const row = result.rows[0];

        if (req.user.role === 'user' && row.requested_by !== req.user.id) {
            return res.status(403).json({ error: 'Нет доступа к этой заявке' });
        }
        res.json(row);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения заявки' });
    }
});

// ---------- POST /api/purchases ----------
router.post('/', upload.single('file'), async (req, res) => {
    try {
        const {
            item_name, quantity, unit, justification,
            priority, planned_date, link, equipment_id
        } = req.body;

        if (!item_name || !quantity || Number(quantity) <= 0) {
            return res.status(400).json({ error: 'Наименование и количество обязательны' });
        }

        let departmentId = req.user.department_id;
        if ((req.user.role === 'admin' || req.user.role === 'moderator')
            && req.body.department_id) {
            departmentId = req.body.department_id;
        }
        if (!departmentId) departmentId = 1;

        const fileName = req.file ? req.file.filename : null;

        const result = await pool.query(`
            INSERT INTO purchase_requests
                (requested_by, department_id, item_name, quantity, unit,
                 justification, priority, planned_date, link, equipment_id, file_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            req.user.id, departmentId, item_name, Number(quantity),
            unit || 'ШТ', justification || null,
            priority || 'normal', planned_date || null,
            link || null, equipment_id || null, fileName
        ]);

        const newRequest = result.rows[0];
        await notifyAdmins(newRequest);

        res.json({ ok: true, id: newRequest.id });
    } catch (err) {
        console.error('Ошибка создания заявки:', err);
        res.status(500).json({ error: 'Ошибка создания заявки' });
    }
});

// ---------- PATCH /api/purchases/:id ----------
router.patch('/:id', requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, comment, supplier, price, quantity_received, actual_date } = req.body;

        const allowed = ['pending', 'in_progress', 'approved', 'done', 'rejected'];
        if (status && !allowed.includes(status)) {
            return res.status(400).json({ error: 'Недопустимый статус' });
        }

        const existing = await pool.query('SELECT * FROM purchase_requests WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }

        const current = existing.rows[0];

        // Статусные правила
       if (status !== undefined) {
    // Нельзя менять статус у завершённых заявок
    if (current.status === 'done' || current.status === 'rejected') {
        return res.status(400).json({ error: 'Статус завершённой заявки изменить нельзя' });
    }
    // Нельзя вернуть «Ожидает», если он уже был изменён
    if (status === 'pending' && current.status !== 'pending') {
        return res.status(400).json({ error: 'Нельзя вернуть статус «Ожидает»' });
    }
}

        const updates = [];
        const values = [];
        let p = 1;

        if (status !== undefined) {
            updates.push(`status = $${p++}`);
            values.push(status);
            updates.push(`resolved_at = CURRENT_TIMESTAMP`);
            updates.push(`resolved_by = $${p++}`);
            values.push(req.user.id);
            if (status === 'done') {
                updates.push(`actual_date = CURRENT_DATE`);
            }
        }
        if (comment !== undefined) {
            updates.push(`comment = $${p++}`);
            values.push(comment);
        }
        if (supplier !== undefined) {
            updates.push(`supplier = $${p++}`);
            values.push(supplier);
        }
        if (price !== undefined) {
            updates.push(`price = $${p++}`);
            values.push(price);
        }
        if (quantity_received !== undefined) {
            updates.push(`quantity_received = $${p++}`);
            values.push(quantity_received);
        }
        if (actual_date !== undefined) {
            updates.push(`actual_date = $${p++}`);
            values.push(actual_date);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        values.push(id);
        await pool.query(
            `UPDATE purchase_requests SET ${updates.join(', ')} WHERE id = $${p}`,
            values
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('Ошибка обновления заявки:', err);
        res.status(500).json({ error: 'Ошибка обновления заявки' });
    }
});

// ---------- DELETE /api/purchases/:id ----------
router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM purchase_requests WHERE id = $1 RETURNING id', [req.params.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Ошибка удаления:', err);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ---------- PUT /api/purchases/:id (редактирование полей) ----------
router.put('/:id', requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await pool.query('SELECT * FROM purchase_requests WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        if (existing.rows[0].status === 'done') {
            return res.status(400).json({ error: 'Заявка выполнена, редактирование запрещено' });
        }

        const {
            item_name, quantity, unit, priority, planned_date,
            justification, link, supplier, price, comment, equipment_id
        } = req.body;

        const updates = [];
        const values = [];
        let p = 1;

        const addField = (col, val) => {
            if (val !== undefined) {
                updates.push(`${col} = $${p++}`);
                values.push(val);
            }
        };

        addField('item_name', item_name);
        addField('quantity', quantity);
        addField('unit', unit);
        addField('priority', priority);
        addField('planned_date', planned_date);
        addField('justification', justification);
        addField('link', link);
        addField('supplier', supplier);
        addField('price', price);
        addField('comment', comment);
        addField('equipment_id', equipment_id);

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        values.push(id);
        await pool.query(
            `UPDATE purchase_requests SET ${updates.join(', ')} WHERE id = $${p}`,
            values
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('Ошибка редактирования заявки:', err);
        res.status(500).json({ error: 'Ошибка редактирования заявки' });
    }
});

module.exports = router;

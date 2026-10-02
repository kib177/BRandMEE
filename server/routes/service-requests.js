const multer = require('multer');
const path = require('path');
const fs = require('fs');

const srStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'public', 'uploads', 'sr');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, 'sr-' + unique + ext);
    }
});
const srUpload = multer({ storage: srStorage, limits: { fileSize: 20 * 1024 * 1024 } });

const ALLOWED_WORK_TYPES = ['Модернизация', 'Дооборудование', 'Новое изделие'];

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

const ALLOWED_STATUSES = ['draft', 'submitted', 'approved', 'in_progress', 'done', 'rejected', 'cancelled'];
const CLOSING = ['done'];
const MANAGER_ROLES = ['admin', 'moderator', 'storekeeper'];

// ---------- GET /api/service-requests ----------
router.get('/', async (req, res) => {
    try {
        const { status, search, from, to } = req.query;
        let q = `
            SELECT sr.*, e.name AS equipment_name, d.name AS department_name,
                   u.username AS author_username, u.display_name AS author_name,
                   (SELECT COUNT(*) FROM service_request_parts p WHERE p.request_id = sr.id) AS parts_count
            FROM service_requests sr
            LEFT JOIN equipment e ON sr.equipment_id = e.id
            LEFT JOIN departments d ON sr.department_id = d.id
            LEFT JOIN users u ON sr.author_id = u.id
            WHERE 1=1
        `;
        const params = [];
        if (status) { params.push(status); q += ` AND sr.status = $${params.length}`; }
        if (search) {
            params.push(`%${search}%`);
            q += ` AND (sr.title ILIKE $${params.length} OR sr.description ILIKE $${params.length} OR sr.number ILIKE $${params.length})`;
        }
        if (from) { params.push(from); q += ` AND sr.created_at >= $${params.length}`; }
        if (to)   { params.push(to + ' 23:59:59'); q += ` AND sr.created_at <= $${params.length}`; }
        q += ' ORDER BY sr.created_at DESC';
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch (e) {
        console.error('SR list:', e);
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

// ---------- GET /api/service-requests/:id ----------
router.get('/:id', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT sr.*, e.name AS equipment_name, d.name AS department_name,
                   u.username AS author_username, u.display_name AS author_name
            FROM service_requests sr
            LEFT JOIN equipment e ON sr.equipment_id = e.id
            LEFT JOIN departments d ON sr.department_id = d.id
            LEFT JOIN users u ON sr.author_id = u.id
            WHERE sr.id = $1
        `, [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ error: 'ДЗ не найдена' });

        const parts = await pool.query(`
            SELECT p.*, i.name AS item_name, i.model
            FROM service_request_parts p
            LEFT JOIN inventory i ON i.code = p.inventory_code AND i.department_id = p.department_id
            WHERE p.request_id = $1
            ORDER BY p.id
        `, [req.params.id]);

        const files = await pool.query(
    `SELECT id, filename, original_name, mime_type, size, created_at
     FROM service_request_files WHERE request_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
);



        res.json({ ...r.rows[0], parts: parts.rows, files: files.rows });
    } catch (e) {
        console.error('SR get:', e);
        res.status(500).json({ error: 'Ошибка' });
    }
});

// ---------- POST /api/service-requests ----------
router.post('/', requireRole(...MANAGER_ROLES), async (req, res) => {
    const { title, number, work_type, description, location, equipment_id,
            needed_by, responsible } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ error: 'Введите заголовок' });
    if (!number || !number.trim()) return res.status(400).json({ error: 'Введите номер ДЗ' });
    if (!ALLOWED_WORK_TYPES.includes(work_type))
        return res.status(400).json({ error: 'Выберите вид работ' });

    try {
        const deptId = req.user.department_id || 1;
        const r = await pool.query(`
            INSERT INTO service_requests
                (number, title, work_type, description, location, equipment_id,
                 needed_by, responsible, author_id, department_id, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')
            RETURNING id
        `, [
            number.trim(), title.trim(), work_type,
            description || null, location || null, equipment_id || null,
            needed_by || null, responsible || null,
            req.user.id, deptId
        ]);
        res.json({ ok: true, id: r.rows[0].id });
    } catch (e) {
        console.error('SR create:', e);
        res.status(500).json({ error: 'Ошибка создания' });
    }
});

// ---------- PUT /api/service-requests/:id ----------
router.put('/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
    try {
        const cur = await pool.query('SELECT status FROM service_requests WHERE id = $1', [req.params.id]);
        if (!cur.rows.length) return res.status(404).json({ error: 'ДЗ не найдена' });
        if (cur.rows[0].status === 'done')
            return res.status(400).json({ error: 'ДЗ закрыта, редактирование запрещено' });

        if (req.body.work_type !== undefined && !ALLOWED_WORK_TYPES.includes(req.body.work_type))
            return res.status(400).json({ error: 'Недопустимый вид работ' });
        if (req.body.number !== undefined && (!req.body.number || !req.body.number.trim()))
            return res.status(400).json({ error: 'Номер обязателен' });

        const fields = ['title','number','work_type','description','location',
                        'equipment_id','needed_by','responsible'];
        const sets = [], vals = [];
        fields.forEach(f => {
            if (req.body[f] !== undefined) {
                vals.push(req.body[f] === '' ? null : req.body[f]);
                sets.push(`${f} = $${vals.length}`);
            }
        });
        if (!sets.length) return res.status(400).json({ error: 'Нет данных для обновления' });
        sets.push('updated_at = CURRENT_TIMESTAMP');
        vals.push(req.params.id);
        await pool.query(`UPDATE service_requests SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
        res.json({ ok: true });
    } catch (e) {
        console.error('SR update:', e);
        res.status(500).json({ error: 'Ошибка обновления' });
    }
});

// ---------- PATCH /api/service-requests/:id/status ----------
router.patch('/:id/status', requireRole(...MANAGER_ROLES), async (req, res) => {
    const { status } = req.body;
    if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cur = await client.query('SELECT * FROM service_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ДЗ не найдена' }); }
        const sr = cur.rows[0];

        if (sr.status === 'done') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'ДЗ уже закрыта' }); }

        // Обновляем статус
        const closingNow = CLOSING.includes(status);
        await client.query(`
            UPDATE service_requests
            SET status = $1, updated_at = CURRENT_TIMESTAMP,
                closed_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE closed_at END
            WHERE id = $3
        `, [status, closingNow, req.params.id]);

        // Если закрываем — создаём списания по запчастям ДЗ
        let writeoffsCreated = 0;
        if (closingNow) {
            const parts = await client.query(`
                SELECT p.*, i.name AS item_name, i.unit AS inv_unit, i.quantity AS stock
                FROM service_request_parts p
                LEFT JOIN inventory i ON i.code = p.inventory_code AND i.department_id = p.department_id
                WHERE p.request_id = $1
            `, [req.params.id]);

            const author = await client.query(
                'SELECT username, display_name FROM users WHERE id = $1', [sr.author_id]
            );
            const authorName = author.rows[0]?.display_name || author.rows[0]?.username || 'система';
            const comment = `Списание по ДЗ №${sr.number || sr.id} от ${new Date(sr.created_at).toLocaleDateString('ru')}: ${sr.title}`;

            for (const p of parts.rows) {
                if (!p.item_name) continue; // запчасти нет на складе — пропуск
                await client.query(`
                    INSERT INTO write_offs
                        (item_code, department_id, item_name, equipment_id, quantity, unit,
                         requested_by, comment, status, requested_at, resolved_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    p.inventory_code, p.department_id, p.item_name,
                    sr.equipment_id || null, p.quantity, p.unit || p.inv_unit || 'ШТ',
                    authorName, comment
                ]);

                // Списываем со склада
                await client.query(`
                    UPDATE inventory
                    SET quantity = GREATEST(quantity - $1, 0), updated_at = CURRENT_TIMESTAMP
                    WHERE code = $2 AND department_id = $3
                `, [p.quantity, p.inventory_code, p.department_id]);

                // Добавляем связь запчасть ↔ оборудование, если указано
                if (sr.equipment_id) {
                    await client.query(`
                        INSERT INTO inventory_equipment (inventory_code, department_id, equipment_id)
                        VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
                    `, [p.inventory_code, p.department_id, sr.equipment_id]);
                }
                writeoffsCreated++;
            }
        }

        await client.query('COMMIT');
        res.json({ ok: true, writeoffsCreated });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('SR status:', e);
        res.status(500).json({ error: 'Ошибка смены статуса' });
    } finally {
        client.release();
    }
});

// ---------- DELETE /api/service-requests/:id ----------
router.delete('/:id', requireRole('admin', 'moderator'), async (req, res) => {
    try {
        const cur = await pool.query('SELECT status FROM service_requests WHERE id = $1', [req.params.id]);
        if (!cur.rows.length) return res.status(404).json({ error: 'ДЗ не найдена' });
        if (cur.rows[0].status === 'done')
            return res.status(400).json({ error: 'Закрытую ДЗ удалять нельзя' });
        await pool.query('DELETE FROM service_requests WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (e) {
        console.error('SR delete:', e);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ---------- POST /api/service-requests/:id/parts ----------
router.post('/:id/parts', requireRole(...MANAGER_ROLES), async (req, res) => {
    const { inventory_code, department_id, quantity, unit, note } = req.body;
    if (!inventory_code || !department_id) return res.status(400).json({ error: 'Не указана запчасть' });

    try {
        const sr = await pool.query('SELECT status FROM service_requests WHERE id = $1', [req.params.id]);
        if (!sr.rows.length) return res.status(404).json({ error: 'ДЗ не найдена' });
        if (sr.rows[0].status === 'done') return res.status(400).json({ error: 'ДЗ уже закрыта' });

        const r = await pool.query(`
            INSERT INTO service_request_parts (request_id, inventory_code, department_id, quantity, unit, note)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
        `, [req.params.id, inventory_code, department_id, quantity || 1, unit || null, note || null]);
        res.json({ ok: true, id: r.rows[0].id });
    } catch (e) {
        console.error('SR add part:', e);
        res.status(500).json({ error: 'Ошибка добавления' });
    }
});

// ---------- DELETE /api/service-requests/:id/parts/:partId ----------
router.delete('/:id/parts/:partId', requireRole(...MANAGER_ROLES), async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM service_request_parts WHERE id = $1 AND request_id = $2',
            [req.params.partId, req.params.id]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('SR del part:', e);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ---------- GET /api/service-requests/:id/files ----------
router.get('/:id/files', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT id, filename, original_name, mime_type, size, created_at
            FROM service_request_files WHERE request_id = $1
            ORDER BY created_at DESC
        `, [req.params.id]);
        res.json(r.rows);
    } catch (e) {
        console.error('SR list files:', e);
        res.status(500).json({ error: 'Ошибка загрузки списка файлов' });
    }
});

// ---------- POST /api/service-requests/:id/files ----------
router.post('/:id/files', requireRole(...MANAGER_ROLES), srUpload.array('files', 10), async (req, res) => {
    try {
        const sr = await pool.query('SELECT status FROM service_requests WHERE id = $1', [req.params.id]);
        if (!sr.rows.length) return res.status(404).json({ error: 'ДЗ не найдена' });
        if (sr.rows[0].status === 'done') return res.status(400).json({ error: 'ДЗ закрыта' });
        if (!req.files || !req.files.length) return res.status(400).json({ error: 'Файлы не выбраны' });

        const results = [];
        for (const f of req.files) {
            const r = await pool.query(`
                INSERT INTO service_request_files
                    (request_id, filename, original_name, mime_type, size, uploaded_by)
                VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
            `, [req.params.id, f.filename, f.originalname, f.mimetype, f.size, req.user.id]);
            results.push({ id: r.rows[0].id, filename: f.filename, original_name: f.originalname });
        }
        res.json({ ok: true, files: results });
    } catch (e) {
        console.error('SR upload files:', e);
        res.status(500).json({ error: 'Ошибка загрузки файлов' });
    }
});

// ---------- DELETE /api/service-requests/:id/files/:fileId ----------
router.delete('/:id/files/:fileId', requireRole(...MANAGER_ROLES), async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT * FROM service_request_files WHERE id = $1 AND request_id = $2',
            [req.params.fileId, req.params.id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Файл не найден' });

        const filePath = path.join(__dirname, '..', 'public', 'uploads', 'sr', r.rows[0].filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await pool.query('DELETE FROM service_request_files WHERE id = $1', [req.params.fileId]);
        res.json({ ok: true });
    } catch (e) {
        console.error('SR del file:', e);
        res.status(500).json({ error: 'Ошибка удаления файла' });
    }
});

module.exports = router;

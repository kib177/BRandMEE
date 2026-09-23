const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendMail } = require('../mailer');
const ExcelJS = require('exceljs');

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

// ---------- POST /api/purchases/export ----------
// Формирует Excel-заявку для ОМТС или ВЭД и переводит заявки в статус «В работе»
router.post('/export', requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
    try {
        const { ids, department } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Не выбраны заявки' });
        }
        if (!['OMTS', 'VED'].includes(department)) {
            return res.status(400).json({ error: 'Отдел должен быть OMTS или VED' });
        }

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const result = await pool.query(`
            SELECT pr.*, e.name AS equipment_name
            FROM purchase_requests pr
            LEFT JOIN equipment e ON pr.equipment_id = e.id
            WHERE pr.id IN (${placeholders})
              AND pr.status = 'approved'
            ORDER BY pr.id
        `, ids);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Нет одобренных заявок для выгрузки' });
        }

        // Переводим выгруженные заявки в статус «В работе»
        const updatePlaceholders = ids.map((_, i) => `$${i + 2}`).join(',');
        await pool.query(`
            UPDATE purchase_requests
            SET status = 'in_progress',
                resolved_at = CURRENT_TIMESTAMP,
                resolved_by = $1
            WHERE id IN (${updatePlaceholders})
              AND status = 'approved'
        `, [req.user.id, ...ids]);

        // ---- Формируем Excel ----
        const isOMTS = department === 'OMTS';
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(isOMTS ? 'Лист1' : 'Заявка');

        const widths = isOMTS
            ? [8, 45, 18, 22, 10, 8, 14, 22, 16, 22, 20, 32]
            : [8, 45, 18, 22, 10, 8, 14, 22, 16, 22, 20];
        widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

        const bold = { bold: true };
        const centerWrap = { horizontal: 'center', vertical: 'middle', wrapText: true };

        // Заголовок
        ws.mergeCells('A1:L1');
        ws.getCell('A1').value = 'ЗАЯВКА НА ЗАКУПКУ';
        ws.getCell('A1').font = { bold: true, size: 14 };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        ws.getCell('A3').value = 'УТВЕРЖДЕНО';
        ws.getCell('A3').font = bold;
        ws.getCell('G3').value = 'ПРИНЯТО К ИСПОЛНЕНИЮ';
        ws.getCell('G3').font = bold;

        ws.getCell('G4').value = isOMTS ? 'Начальник ОМТС и ВК' : 'Начальник ОВЭД';
        ws.getCell('G5').value = isOMTS ? 'Лешкевич Ю.А.' : 'Лойко К.Ю.';
        ws.getCell('A5').value = '__________________________________';
        ws.getCell('A6').value = 'Директор                          С.И.Советников';
        ws.getCell('G6').value = 'Исполнитель';

        ws.getCell('A8').value = 'исходящие';
        ws.getCell('G8').value = 'входящие';
        ws.getCell('A9').value = 'Номер заявки подразделения';
        ws.getCell('G9').value = `Номер заявки согласно регистрации ${isOMTS ? 'ОМТС и ВК' : 'ОВЭД'}`;
        ws.getCell('A10').value = 'Дата создания заявки';
        ws.getCell('D10').value = new Date();
        ws.getCell('D10').numFmt = 'dd.mm.yyyy';
        ws.getCell('G10').value = `Дата регистрации заявки в ${isOMTS ? 'ОМТС и ВК' : 'ОВЭД'}`;

        ws.getCell('A12').value = 'Подразделение инициатора                              БРиОЭО          СГИ';

        // Шапка таблицы
        const headers = isOMTS
            ? ['№ п/п','Наименование','Потенциальные производители','Артикул производителя',
               'Ед. изм.','Кол-во','Стоимость   р/шт.','Наличие закупаемых позиций в бюджете подразделения',
               'Желаемая дата прихода на склад','Крайняя (критически необходимая)дата прихода на склад',
               'Цель закупки','']
            : ['№ п/п','Наименование','Потенциальные производители','Артикул производителя',
               'Ед. изм.','Кол-во','Цена   € всего','Наличие закупаемых позиций в бюджете подразделения',
               'Желаемая дата прихода на склад','Крайняя (критически необходимая)дата прихода на склад',
               'Цель закупки'];

        const headerRow = ws.getRow(14);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = bold;
            cell.alignment = centerWrap;
            cell.border = {
                top:    { style: 'thin' },
                left:   { style: 'thin' },
                bottom: { style: 'thin' },
                right:  { style: 'thin' }
            };
        });
        headerRow.height = 42;

        // Данные
        let rowIdx = 15;
        result.rows.forEach((r, i) => {
            const row = ws.getRow(rowIdx++);
            const priceVal = r.price != null && r.price !== '' ? Number(r.price) : 'По запросу';
            const data = [
                i + 1,
                r.item_name || '',
                r.supplier || '',
                r.article || '',
                r.unit || 'шт.',
                r.quantity || '',
                priceVal,
                'да',
                r.planned_date ? new Date(r.planned_date) : '',
                '',
                r.equipment_name || ''
            ];
            if (isOMTS) data.push(r.link || '');

            data.forEach((v, j) => {
                const cell = row.getCell(j + 1);
                cell.value = v;
                cell.alignment = { vertical: 'middle', wrapText: true };
                cell.border = {
                    top:    { style: 'thin' },
                    left:   { style: 'thin' },
                    bottom: { style: 'thin' },
                    right:  { style: 'thin' }
                };
            });
            if (r.planned_date) row.getCell(9).numFmt = 'dd.mm.yyyy';
        });

        // Пропуск строки
        rowIdx++;

        // Подписи
        ws.getCell(`A${rowIdx}`).value = 'Начальник БРиОЭО';
        ws.getCell(`D${rowIdx}`).value = '_______________________________';
        ws.getCell(`G${rowIdx}`).value = 'Белецкий В.Н.';
        rowIdx++;
        ws.getCell(`D${rowIdx}`).value = 'подпись';
        rowIdx += 2;
        ws.getCell(`A${rowIdx}`).value = 'Заместитель директора – главный инженер';
        ws.getCell(`D${rowIdx}`).value = '_______________________';
        ws.getCell(`G${rowIdx}`).value = 'Сороко А.И.';
        rowIdx++;
        ws.getCell(`D${rowIdx}`).value = 'подпись';

        const filename = `zayavka_${department}_${new Date().toISOString().slice(0,10)}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Ошибка выгрузки заявок:', err);
        res.status(500).json({ error: 'Ошибка выгрузки заявок' });
    }
});

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
            item_name, article, quantity, unit, justification,
            priority, planned_date, link, equipment_id
        } = req.body;

        if (!item_name || !article || !quantity || Number(quantity) <= 0) {
            return res.status(400).json({ error: 'Наименование, артикул и количество обязательны' });
        }

        let departmentId = req.user.department_id;
        if ((req.user.role === 'admin' || req.user.role === 'moderator') && req.body.department_id) {
            departmentId = req.body.department_id;
        }
        if (!departmentId) departmentId = 1;

        const fileName = req.file ? req.file.filename : null;

        const result = await pool.query(`
            INSERT INTO purchase_requests
                (requested_by, department_id, item_name, article, quantity, unit,
                 justification, priority, planned_date, link, equipment_id, file_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            req.user.id, departmentId, item_name, article, Number(quantity),
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
            item_name, article, quantity, unit, priority, planned_date,
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
        addField('article', article); 
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
        if (article !== undefined && (!article || !article.trim())) {
        return res.status(400).json({ error: 'Артикул обязателен' });
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

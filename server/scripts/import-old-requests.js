/**
 * Импорт старых заявок из «ЗАЯВКИ ВЫПОЛНЕНИЕ.xlsx».
 * Запуск: node scripts/import-old-requests.js /путь/к/файлу.xlsx
 *
 * Логика:
 *  - лист "Заявки"
 *  - цвет заливки ячейки O определяет статус:
 *      зелёный  -> done
 *      серый    -> rejected
 *      нет заливки -> in_progress
 *  - столбец N (Исполнитель) идёт в supplier
 */

require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const pool = require('../db');

// ---------- КОНФИГ ----------
const SHEET_NAME       = 'Заявки';
const HEADER_ROW       = 15;           // строка с шапкой таблицы (№ п/п | Наименование | ...)
const DEFAULT_DEPT_ID  = 1;            // БРиОЭО
const DEFAULT_USER_ID  = 1;            // admin

// ---------- ЦВЕТА ----------
// Сравниваем по RGB с допуском — Excel может отдавать разные оттенки.
function isGreen(argb) {
    if (!argb) return false;
    const m = /^FF?([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(String(argb));
    if (!m) return false;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    // зелёный: G заметно больше R и B
    return g > 100 && g > r + 30 && g > b + 30;
}
function isGrey(argb) {
    if (!argb) return false;
    const m = /^FF?([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(String(argb));
    if (!m) return false;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    // серый: каналы близки и цвет не белый
    const maxDiff = Math.max(r,g,b) - Math.min(r,g,b);
    return maxDiff < 25 && r < 245;
}
function detectStatus(cell) {
    const fill = cell.fill;
    if (!fill || fill.type !== 'pattern') return 'in_progress';
    const argb = fill.fgColor && fill.fgColor.argb;
    if (isGreen(argb)) return 'done';
    if (isGrey(argb))  return 'rejected';
    return 'in_progress';
}

// ---------- ХЕЛПЕРЫ ----------
function cellText(cell) {
    if (cell == null || cell.value == null) return '';
    let v = cell.value;
    if (v && typeof v === 'object') {
        if (v.richText) v = v.richText.map(t => t.text).join('');
        else if (v.text) v = v.text;
        else if (v.result != null) v = v.result;
        else if (v instanceof Date) v = v;
        else v = String(v);
    }
    if (v instanceof Date) return v;
    return String(v).trim();
}

function parseDateMaybe(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const s = String(v).trim();
    // YYYY-MM-DD
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    // DD.MM.YYYY
    m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
}

function parsePrice(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(',', '.').replace(/\s/g, '').replace(/[^\d.]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

function parseQty(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(',', '.').replace(/\s/g, '').replace(/<br\s*\/?>/gi, '').replace(/[^\d.]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

// ---------- ОСНОВНАЯ ЛОГИКА ----------
async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Использование: node scripts/import-old-requests.js /путь/к/файлу.xlsx');
        process.exit(1);
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(filePath));
    const ws = wb.getWorksheet(SHEET_NAME);
    if (!ws) {
        console.error(`Лист "${SHEET_NAME}" не найден`);
        process.exit(1);
    }

    const rows = [];
    let lastKnownDate = null;

    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber <= HEADER_ROW) return;

        const name = cellText(row.getCell(4));   // D
        if (!name) return;                        // пустая / продолжение — пропускаем

        // Дата (B) — если пусто, берём последнюю известную
        let reqDate = parseDateMaybe(row.getCell(2));
        if (reqDate) lastKnownDate = reqDate;
        else reqDate = lastKnownDate;

        const article   = cellText(row.getCell(6));    // F
        const unit      = cellText(row.getCell(7));    // G
        const qty       = parseQty(row.getCell(8));    // H
        const price     = parsePrice(row.getCell(9));  // I
        const goal      = cellText(row.getCell(13));   // M
        const executor  = cellText(row.getCell(14));   // N → supplier
        const status    = detectStatus(row.getCell(15)); // O по цвету

        // Комментарий: P + Q + R + S + T
        const parts = [16, 17, 18, 19, 20]
            .map(i => cellText(row.getCell(i)))
            .filter(Boolean);
        const comment = parts.join(' | ');

        rows.push({
            item_name: name,
            article,
            unit: unit || 'шт.',
            quantity: qty,
            price,
            justification: goal || null,
            supplier: executor || null,
            status,
            comment: comment || null,
            planned_date: reqDate,
            created_at: reqDate,
        });
    });

    console.log(`Найдено строк для импорта: ${rows.length}`);
    const byStatus = rows.reduce((a, r) => (a[r.status] = (a[r.status]||0)+1, a), {});
    console.log('  по статусам:', byStatus);

    if (rows.length === 0) {
        console.log('Нечего импортировать');
        process.exit(0);
    }

    // ---------- ВСТАВКА ----------
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let inserted = 0;
        for (const r of rows) {
            await client.query(`
                INSERT INTO purchase_requests
                    (requested_by, department_id, item_name, article, quantity, unit,
                     justification, priority, planned_date, supplier, price,
                     comment, status, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14, CURRENT_TIMESTAMP))
            `, [
                DEFAULT_USER_ID,
                DEFAULT_DEPT_ID,
                r.item_name,
                r.article || null,
                r.quantity != null ? r.quantity : 1,
                r.unit,
                r.justification,
                'normal',
                r.planned_date,
                r.supplier,
                r.price,
                r.comment,
                r.status,
                r.created_at,
            ]);
            inserted++;
        }

        await client.query('COMMIT');
        console.log(`✅ Импортировано: ${inserted}`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка вставки, откат:', e.message);
        process.exit(1);
    } finally {
        client.release();
    }

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

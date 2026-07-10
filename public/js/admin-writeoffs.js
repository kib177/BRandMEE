const $ = (s) => document.querySelector(s);
const API = '/api/write-offs';
let token = sessionStorage.getItem('token');
let currentUser = null;

async function init() {
    if (!token) {
        window.location.href = '/';
        return;
    }
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        if (data.user.role !== 'admin') {
            alert('Доступ запрещён');
            window.location.href = '/';
            return;
        }
        currentUser = data.user;
        loadRequests({ status: 'pending' });
    } catch (e) {
        window.location.href = '/';
    }
}

function authHeaders() {
    return { 'Authorization': `Bearer ${token}` };
}

async function loadRequests(params = {}) {
    const url = new URL(API, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, v);
    });
    try {
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) {
            if (res.status === 401) {
                alert('Сессия истекла, войдите заново');
                sessionStorage.removeItem('token');
                window.location.reload();
                return;
            }
            throw new Error('Ошибка загрузки');
        }
        const data = await res.json();
        renderTable(data);
    } catch (e) {
        alert(e.message);
    }
}

function renderTable(requests) {
    const tbody = $('#requestsTable tbody');
    tbody.innerHTML = requests.map(r => `
        <tr>
            <td>${r.id}</td>
            <td>${r.item_code}</td>
            <td>${r.item_name}</td>
            <td>${r.quantity} ${r.unit}</td>
            <td>${r.equipment_name || '—'}</td>
            <td>${r.requested_by}</td>
            <td>${new Date(r.requested_at).toLocaleDateString('ru')}</td>
            <td class="status" style="color:${r.status==='approved'?'green':r.status==='rejected'?'red':'orange'}">${r.status}</td>
            <td title="${r.comment || ''}">${r.comment ? r.comment.substring(0, 30) + (r.comment.length > 30 ? '…' : '') : '—'}</td>
            <td>
                ${r.status === 'pending' ? `
                    <button class="btn btn-success btn-sm js-resolve" data-id="${r.id}" data-status="approved">✅</button>
                    <button class="btn btn-danger btn-sm js-resolve" data-id="${r.id}" data-status="rejected">❌</button>
                ` : '<span style="font-size:0.8rem;">—</span>'}
            </td>
        </tr>
    `).join('');

    tbody.removeEventListener('click', onTableClick);
    tbody.addEventListener('click', onTableClick);
}

function onTableClick(e) {
    const btn = e.target.closest('.js-resolve');
    if (!btn) return;
    const id = btn.dataset.id;
    const status = btn.dataset.status;
    resolve(Number(id), status);
}

async function resolve(id, status) {
    const msg = status === 'approved' ? 'подтвердить списание' : 'отклонить';
    if (!confirm(`Вы уверены, что хотите ${msg}?`)) return;
    try {
        const res = await fetch(`${API}/${id}`, {
            method: 'PATCH',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Ошибка');
        } else {
            loadRequests(getCurrentFilters());
            showToast(`Заявка ${status === 'approved' ? 'подтверждена' : 'отклонена'}`, 'success');
        }
    } catch (e) {
        alert('Ошибка сети');
    }
}

function getCurrentFilters() {
    return {
        status: $('#filterStatus').value,
        from: $('#filterFrom').value,
        to: $('#filterTo').value,
        equipment: $('#filterEquip').value
    };
}

async function exportExcel() {
    try {
        const filters = getCurrentFilters();
        const allData = await fetchAllForExport(filters);
        const exportData = allData.map(r => ({
            'ID': r.id,
            'Код': r.item_code,
            'Наименование': r.item_name,
            'Количество': r.quantity,
            'Ед.изм.': r.unit,
            'Оборудование': r.equipment_name || '',
            'Запросил': r.requested_by,
            'Дата запроса': new Date(r.requested_at).toLocaleString('ru'),
            'Статус': r.status,
            'Дата решения': r.resolved_at ? new Date(r.resolved_at).toLocaleString('ru') : '',
            'Комментарий': r.comment || ''
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Списания');
        XLSX.writeFile(wb, `spisaniya_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Excel-отчёт сохранён');
    } catch (e) {
        alert('Ошибка экспорта: ' + e.message);
    }
}

async function exportCSV() {
    try {
        const filters = getCurrentFilters();
        const allData = await fetchAllForExport(filters);
        const headers = ['ID', 'Код', 'Наименование', 'Количество', 'Ед.изм.', 'Оборудование', 'Запросил', 'Дата запроса', 'Статус', 'Дата решения', 'Комментарий'];
        const rows = allData.map(r => [
            r.id, r.item_code, r.item_name, r.quantity, r.unit,
            r.equipment_name || '', r.requested_by,
            new Date(r.requested_at).toLocaleString('ru'),
            r.status,
            r.resolved_at ? new Date(r.resolved_at).toLocaleString('ru') : '',
            r.comment || ''
        ]);
        const csv = [headers, ...rows]
            .map(row => row.map(c => String(c).includes(';') ? `"${c}"` : c).join(';'))
            .join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `spisaniya_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        showToast('CSV-отчёт сохранён');
    } catch (e) {
        alert('Ошибка экспорта: ' + e.message);
    }
}

async function fetchAllForExport(filters) {
    const url = new URL(API, window.location.origin);
    Object.entries(filters).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, v);
    });
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Ошибка загрузки для экспорта');
    return await res.json();
}

async function loadReport() {
    const year = $('#reportYear').value;
    try {
        const res = await fetch(`${API}/report?year=${year}`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Ошибка загрузки отчёта');
        const data = await res.json();

        // Сводка по месяцам и оборудованию
        let html = `<h3>${year} год — сводка</h3>`;
        html += '<table><tr><th>Месяц</th><th>Списано единиц</th><th>Заявок</th></tr>';
        const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        if (data.monthly && data.monthly.length) {
            data.monthly.forEach(m => {
                html += `<tr><td>${months[parseInt(m.month)-1]}</td><td>${m.total_quantity}</td><td>${m.count_requests}</td></tr>`;
            });
        } else {
            html += '<tr><td colspan="3">Нет данных</td></tr>';
        }
        html += '</table>';

        html += '<h4>По оборудованию</h4><ul>';
        if (data.byEquipment && data.byEquipment.length) {
            data.byEquipment.forEach(e => {
                html += `<li>${e.equipment || 'Без указания'}: ${e.total_quantity} ед. (${e.count_requests} заявок)</li>`;
            });
        } else {
            html += '<li>Нет данных</li>';
        }
        html += '</ul>';

        // Детальная таблица всех записей за год
        html += `<h3>Детализация всех списаний за ${year} год</h3>`;
        if (data.details && data.details.length) {
            html += `<table><thead><tr>
                <th>ID</th><th>Дата/время запроса</th><th>Код</th><th>Наименование</th>
                <th>Кол-во</th><th>Ед.</th><th>Оборудование</th><th>Запросил</th>
                <th>Статус</th><th>Дата решения</th><th>Комментарий</th>
            </tr></thead><tbody>`;
            data.details.forEach(r => {
                const reqDate = new Date(r.requested_at).toLocaleString('ru');
                const resDate = r.resolved_at ? new Date(r.resolved_at).toLocaleString('ru') : '—';
                html += `<tr>
                    <td>${r.id}</td>
                    <td>${reqDate}</td>
                    <td>${r.item_code}</td>
                    <td>${r.item_name}</td>
                    <td>${r.quantity}</td>
                    <td>${r.unit}</td>
                    <td>${r.equipment_name || '—'}</td>
                    <td>${r.requested_by}</td>
                    <td style="color:${r.status==='approved'?'green':r.status==='rejected'?'red':'orange'}">${r.status}</td>
                    <td>${resDate}</td>
                    <td>${r.comment || '—'}</td>
                </tr>`;
            });
            html += '</tbody></table>';
        } else {
            html += '<p>Нет записей за этот год.</p>';
        }

        $('#reportArea').innerHTML = html;
    } catch (e) {
        alert('Ошибка загрузки отчёта');
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function bindUIEvents() {
    $('#applyFilter').addEventListener('click', () => loadRequests(getCurrentFilters()));
    $('#filterStatus').addEventListener('change', () => loadRequests(getCurrentFilters()));
    $('#exportExcel').addEventListener('click', exportExcel);
    $('#exportCSV').addEventListener('click', exportCSV);
    $('#loadReport').addEventListener('click', loadReport);
    $('#btnLogout').addEventListener('click', () => {
        sessionStorage.removeItem('token');
        window.location.href = '/';
    });
}

init();
bindUIEvents();

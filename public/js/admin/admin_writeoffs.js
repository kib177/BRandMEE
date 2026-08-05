const API = '/api/write-offs';

async function loadDepartmentsForFilter() {
    try {
        const res = await fetch('/api/directories/departments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const depts = await res.json();
            const select = $('#filterDepartment');
            if (select) {
                select.innerHTML = '<option value="">🏢 Все отделы</option>' +
                    depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
            }
        }
    } catch (e) {
        console.error('Ошибка загрузки отделов для фильтра', e);
    }
}

async function init() {
    if (!token) {
        window.location.href = '/welcome.html';
        return;
    }
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        if (data.user.role !== 'admin' && data.user.role !== 'moderator' && data.user.role !== 'storekeeper') {
            alert('Доступ запрещён');
            window.location.href = '/welcome.html';
            return;
        }
        currentUser = data.user;
        loadRequests({ status: 'pending' });
        loadDepartmentsForFilter(); 
    } catch (e) {
        window.location.href = '/welcome.html';
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
                localStorage.removeItem('token');
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
            <td>${r.model || '—'}</td>                 <!-- артикул -->
            <td>${r.quantity}</td>
            <td>${r.unit}</td>
            <td>${r.equipment_name || '—'}</td>
            <td>${r.requester_display_name || r.requested_by}</td>
            <td>${new Date(r.requested_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</td>
            <td class="status" style="color:${r.status==='approved'?'green':r.status==='rejected'?'red':'orange'}">${r.status}</td>
            <td title="${r.comment || ''}">${r.comment ? r.comment.substring(0, 30) + (r.comment.length > 30 ? '…' : '') : '—'}</td>
            <td>
  ${r.status === 'pending' ? `
    <button class="btn btn-success btn-sm js-resolve" data-id="${r.id}" data-status="approved">✅</button>
    <button class="btn btn-danger btn-sm js-resolve" data-id="${r.id}" data-status="rejected">❌</button>
  ` : ''}
  <button class="btn btn-outline btn-sm js-delete-request" data-id="${r.id}" title="Удалить заявку">🗑️</button>
</td>
        </tr>
    `).join('');

    tbody.removeEventListener('click', onTableClick);
    tbody.addEventListener('click', onTableClick);
    document.querySelectorAll('.js-delete-request').forEach(btn => {
    btn.addEventListener('click', () => deleteRequest(btn.dataset.id));
});
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
    const filters = {
        status: $('#filterStatus').value,
        from: $('#filterFrom').value,
        to: $('#filterTo').value,
        equipment: $('#filterEquip').value
    };

    // Для не-админов всегда отправляем свой department_id
    if (currentUser && currentUser.role !== 'admin') {
        filters.department_id = currentUser.department_id;
    } else {
        // Админ может выбирать через выпадающий список
        const deptSelect = $('#filterDepartment');
        filters.department_id = deptSelect ? deptSelect.value : '';
    }

    return filters;
}

// 📥 Экспорт Excel — динамическая загрузка библиотеки
async function exportExcel() {
    try {
        await loadScript('/js/library/xlsx.full.min.js');   // загружаем библиотеку
        const filters = getCurrentFilters();
        const allData = await fetchAllForExport(filters);
        const exportData = allData.map(r => ({
            'ID': r.id,
            'Код': r.item_code,
            'Наименование': r.item_name,
            'Количество': r.quantity,
            'Ед.изм.': r.unit,
            'Оборудование': r.equipment_name || '',
            'Запросил': r.requester_display_name || r.requested_by,
            'Дата запроса': new Date(r.requested_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
            'Статус': r.status,
            'Дата решения': r.resolved_at ? new Date(r.resolved_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '',
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

// 📄 Экспорт CSV
async function exportCSV() {
    try {
        const filters = getCurrentFilters();
        const allData = await fetchAllForExport(filters);
        const headers = ['ID', 'Код', 'Наименование', 'Количество', 'Ед.изм.', 'Оборудование', 'Запросил', 'Дата запроса', 'Статус', 'Дата решения', 'Комментарий'];
        const rows = allData.map(r => [
            r.id, r.item_code, r.item_name, r.quantity, r.unit,
            r.equipment_name || '', r.requester_display_name || r.requested_by,
            new Date(r.requested_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
            r.status,
            r.resolved_at ? new Date(r.resolved_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '',
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

        let html = `<h3>${year} год — сводка</h3>`;
        html += '<div style="overflow-x: auto;"><table><tr><th>Месяц</th><th>Списано единиц</th><th>Заявок</th></tr>';
        const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        if (data.monthly && data.monthly.length) {
            data.monthly.forEach(m => {
                html += `<tr><td>${months[parseInt(m.month)-1]}</td><td>${m.total_quantity}</td><td>${m.count_requests}</td></tr>`;
            });
        } else {
            html += '<tr><td colspan="3">Нет данных</td></tr>';
        }
        html += '</table></div>';

        html += '<h4>По оборудованию</h4><ul>';
        if (data.byEquipment && data.byEquipment.length) {
            data.byEquipment.forEach(e => {
                html += `<li>${e.equipment || 'Без указания'}: ${e.total_quantity} ед. (${e.count_requests} заявок)</li>`;
            });
        } else {
            html += '<li>Нет данных</li>';
        }
        html += '</ul>';

        html += `<h3>Детализация всех списаний за ${year} год</h3>`;
        html += '<div style="overflow-x: auto;"><table><thead><tr>';
        html += '<th>ID</th><th>Дата/время запроса</th><th>Код</th><th>Наименование</th>';
        html += '<th>Артикул</th><th>Кол-во</th><th>Ед.</th><th>Оборудование</th><th>Запросил</th>';
        html += '<th>Статус</th><th>Дата решения</th><th>Комментарий</th>';
        html += '</tr></thead><tbody>';
        if (data.details && data.details.length) {
            data.details.forEach(r => {
                const reqDate = new Date(r.requested_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
                const resDate = r.resolved_at ? new Date(r.resolved_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—';
                html += `<tr>
                    <td>${r.id}</td>
                    <td>${reqDate}</td>
                    <td>${r.item_code}</td>
                    <td>${r.item_name}</td>
                    <td>${r.model || '—'}</td>
                    <td>${r.quantity}</td>
                    <td>${r.unit}</td>
                    <td>${r.equipment_name || '—'}</td>
                    <td>${r.requester_display_name || r.requested_by}</td>
                    <td style="color:${r.status==='approved'?'green':r.status==='rejected'?'red':'orange'}">${r.status}</td>
                    <td>${resDate}</td>
                    <td>${r.comment || '—'}</td>
                </tr>`;
            });
            html += '</tbody></table></div>';
        } else {
            html += '</tbody></table></div><p>Нет записей за этот год.</p>';
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
    const applyFilterBtn = $('#applyFilter');
    if (applyFilterBtn) applyFilterBtn.addEventListener('click', () => loadRequests(getCurrentFilters()));

    const filterStatusEl = $('#filterStatus');
    if (filterStatusEl) filterStatusEl.addEventListener('change', () => loadRequests(getCurrentFilters()));

    const exportExcelBtn = $('#exportExcel');
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportExcel);

    const exportCSVBtn = $('#exportCSV');
    if (exportCSVBtn) exportCSVBtn.addEventListener('click', exportCSV);

    const loadReportBtn = $('#loadReport');
    if (loadReportBtn) loadReportBtn.addEventListener('click', loadReport);

    const btnLogout = $('#btnLogout');
    if (btnLogout) btnLogout.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/welcome.html';
    });

    const deptFilter = $('#filterDepartment');
    if (deptFilter) {
        deptFilter.addEventListener('change', () => {
            loadRequests(getCurrentFilters());
        });
    }
}

async function deleteRequest(id) {
  if (!confirm('Удалить заявку безвозвратно?')) return;
  try {
    const res = await fetch(`${API}/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Ошибка удаления');
    } else {
      loadRequests(getCurrentFilters());
      showToast('Заявка удалена', 'success');
    }
  } catch (e) {
    alert('Ошибка сети');
  }
}

init();
bindUIEvents();

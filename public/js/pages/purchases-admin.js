// purchases-admin.js – управление заявками на закупку
(function () {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/welcome.html'; return; }

    const API = '/api/purchases';
    let currentData = [];

   function statusLabel(status) {
    const map = {
        'pending':     'Ожидает',
        'in_progress': 'В работе',
        'approved':    'Одобрена',
        'done':        'Выполнена',
        'rejected':    'Отклонена'
    };
    return map[status] || status;
}

    function priorityLabel(p) {
        const map = { 'low': 'Низкий', 'normal': 'Обычный', 'high': 'Высокий' };
        return map[p] || '—';
    }

    // ---------- Фильтры ----------
    function getFilters() {
        return {
            status: document.getElementById('filterStatus').value,
            department_id: document.getElementById('filterDepartment')?.value || '',
            from: document.getElementById('filterFrom').value,
            to: document.getElementById('filterTo').value,
            search: document.getElementById('searchInput').value.trim()
        };
    }

    // ---------- Загрузка отделов ----------
    async function loadDepartments() {
        const select = document.getElementById('filterDepartment');
        if (!select) return;
        try {
            const res = await fetch('/api/directories/departments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const depts = await res.json();
            select.innerHTML = '<option value="">Все отделы</option>' +
                depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        } catch (e) { /* игнорируем */ }
    }

    // ---------- Сводка ----------
   async function loadSummary() {
    try {
        const res = await fetch(`${API}/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const s = await res.json();
        document.getElementById('sumTotal').textContent    = s.total    || 0;
        document.getElementById('sumPending').textContent  = s.pending  || 0;
        document.getElementById('sumApproved').textContent = s.approved || 0;
        document.getElementById('sumDone').textContent     = s.done     || 0;
        document.getElementById('sumRejected').textContent = s.rejected || 0;
    } catch (e) { console.error(e); }
}

    // ---------- Загрузка заявок ----------
    async function loadRequests() {
        const params = new URLSearchParams();
        Object.entries(getFilters()).forEach(([k, v]) => { if (v) params.append(k, v); });

        try {
            const res = await fetch(`${API}?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Ошибка загрузки');
            currentData = await res.json();
            renderTable(currentData);
        } catch (e) {
            alert(e.message);
        }
    }

    // ---------- Рендер таблицы ----------
   function renderTable(rows) {
    const tbody = document.querySelector('#purchasesTable tbody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:2rem;">Нет заявок</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const isDone = r.status === 'done';
        // Собираем опции с учётом правил
        const statuses = ['pending', 'in_progress', 'approved', 'done', 'rejected'];
        const options = statuses.map(s => {
            // «Ожидает» показываем только если заявка ещё pending
            if (s === 'pending' && r.status !== 'pending') return '';
            const sel = r.status === s ? 'selected' : '';
            return `<option value="${s}" ${sel}>${statusLabel(s)}</option>`;
        }).join('');

        const selectHtml = isDone
            ? `<span class="status-badge done">${statusLabel('done')}</span>`
            : `<select class="status-select" data-id="${r.id}">${options}</select>`;

        return `
            <tr class="status-${r.status}">
                <td>${r.id}</td>
                <td>${new Date(r.created_at).toLocaleDateString('ru')}</td>
                <td>${escapeHtml(r.item_name)}</td>
                <td>${r.quantity}</td>
                <td>${r.unit || '—'}</td>
                <td>${escapeHtml(r.department_name || '—')}</td>
                <td>${escapeHtml(r.requested_by_name || r.requested_by_username || '—')}</td>
                <td>${priorityLabel(r.priority)}</td>
                <td>${r.planned_date ? new Date(r.planned_date).toLocaleDateString('ru') : '—'}</td>
                <td>${selectHtml}</td>
                <td>
                    <button class="btn-icon js-view" data-id="${r.id}" title="Открыть">👁️</button>
                    ${!isDone ? `<button class="btn-icon js-edit" data-id="${r.id}" title="Редактировать">✏️</button>` : ''}
                    <button class="btn-icon js-delete" data-id="${r.id}" title="Удалить" style="color:red;">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    // Смена статуса
    tbody.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            const id = sel.dataset.id;
            const status = sel.value;
            try {
                const res = await fetch(`${API}/${id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ status })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Ошибка');
                }
                loadRequests();
                loadSummary();
            } catch (e) {
                alert(e.message);
                loadRequests();
            }
        });
    });

    tbody.querySelectorAll('.js-view').forEach(btn => {
        btn.addEventListener('click', () => openCard(btn.dataset.id));
    });

    tbody.querySelectorAll('.js-edit').forEach(btn => {
        btn.addEventListener('click', () => openEdit(btn.dataset.id));
    });

    tbody.querySelectorAll('.js-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Удалить заявку?')) return;
            try {
                const res = await fetch(`${API}/${btn.dataset.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Ошибка');
                }
                loadRequests();
                loadSummary();
            } catch (e) { alert(e.message); }
        });
    });
}

    async function openEdit(id) {
    try {
        const res = await fetch(`${API}/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не удалось загрузить заявку');
        const r = await res.json();

        document.getElementById('editId').value = r.id;
        document.getElementById('editItemName').value = r.item_name || '';
        document.getElementById('editQuantity').value = r.quantity || '';
        document.getElementById('editUnit').value = r.unit || 'ШТ';
        document.getElementById('editPriority').value = r.priority || 'normal';
        document.getElementById('editPlannedDate').value =
            r.planned_date ? r.planned_date.slice(0, 10) : '';
        document.getElementById('editJustification').value = r.justification || '';
        document.getElementById('editLink').value = r.link || '';
        document.getElementById('editSupplier').value = r.supplier || '';
        document.getElementById('editPrice').value = r.price || '';
        document.getElementById('editComment').value = r.comment || '';

        document.getElementById('editOverlay').classList.remove('hidden');
    } catch (e) {
        alert(e.message);
    }
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const payload = {
        item_name:     document.getElementById('editItemName').value.trim(),
        quantity:      parseFloat(document.getElementById('editQuantity').value),
        unit:          document.getElementById('editUnit').value,
        priority:      document.getElementById('editPriority').value,
        planned_date:  document.getElementById('editPlannedDate').value || null,
        justification: document.getElementById('editJustification').value.trim(),
        link:          document.getElementById('editLink').value.trim(),
        supplier:      document.getElementById('editSupplier').value.trim(),
        price:         document.getElementById('editPrice').value || null,
        comment:       document.getElementById('editComment').value.trim()
    };

    try {
        const res = await fetch(`${API}/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка сохранения');
        }
        document.getElementById('editOverlay').classList.add('hidden');
        loadRequests();
        loadSummary();
    } catch (e) {
        alert(e.message);
    }
});
    
    // ---------- Просмотр карточки ----------
    async function openCard(id) {
        try {
            const res = await fetch(`${API}/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Не удалось загрузить заявку');
            const r = await res.json();

            const fileLink = r.file_path
                ? `<p><b>Файл:</b> <a href="/uploads/purchases/${r.file_path}" target="_blank">Открыть</a></p>`
                : '';

            document.getElementById('viewContent').innerHTML = `
                <p><b>ID:</b> ${r.id}</p>
                <p><b>Статус:</b> <span class="status-badge ${r.status}">${statusLabel(r.status)}</span></p>
                <p><b>Дата:</b> ${new Date(r.created_at).toLocaleString('ru')}</p>
                <p><b>Заявитель:</b> ${r.requested_by_name || r.requested_by_username || '—'}</p>
                <p><b>Отдел:</b> ${r.department_name || '—'}</p>
                <p><b>Наименование:</b> ${r.item_name}</p>
                <p><b>Количество:</b> ${r.quantity} ${r.unit || ''}</p>
                <p><b>Приоритет:</b> ${priorityLabel(r.priority)}</p>
                <p><b>Планируемая дата:</b> ${r.planned_date ? new Date(r.planned_date).toLocaleDateString('ru') : '—'}</p>
                <p><b>Обоснование:</b><br>${r.justification || '—'}</p>
                <p><b>Оборудование:</b> ${r.equipment_name || '—'}</p>
                <p><b>Поставщик:</b> ${r.supplier || '—'}</p>
                <p><b>Цена:</b> ${r.price ? r.price + ' BYN' : '—'}</p>
                <p><b>Ссылка:</b> ${r.link ? `<a href="${r.link}" target="_blank">${r.link}</a>` : '—'}</p>
                ${fileLink}
                <p><b>Комментарий:</b><br>${r.comment || '—'}</p>
            `;
            document.getElementById('viewOverlay').classList.remove('hidden');
        } catch (e) { alert(e.message); }
    }

    // ---------- Экспорт в Excel ----------
    function exportExcel() {
        if (!currentData.length) return alert('Нет данных для экспорта');

        const data = currentData.map(r => ({
            'ID': r.id,
            'Дата': new Date(r.created_at).toLocaleDateString('ru'),
            'Наименование': r.item_name,
            'Количество': r.quantity,
            'Ед.': r.unit || '',
            'Отдел': r.department_name || '',
            'Заявитель': r.requested_by_name || r.requested_by_username || '',
            'Приоритет': priorityLabel(r.priority),
            'Планируемая дата': r.planned_date ? new Date(r.planned_date).toLocaleDateString('ru') : '',
            'Статус': statusLabel(r.status),
            'Поставщик': r.supplier || '',
            'Цена': r.price || '',
            'Комментарий': r.comment || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Закупки');
        XLSX.writeFile(wb, `purchases_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    // ---------- Кнопки ----------
    document.getElementById('btnApply').addEventListener('click', () => {
        loadRequests();
        loadSummary();
    });

    document.getElementById('btnReset').addEventListener('click', () => {
        document.getElementById('filterStatus').value = '';
        document.getElementById('filterDepartment').value = '';
        document.getElementById('filterFrom').value = '';
        document.getElementById('filterTo').value = '';
        document.getElementById('searchInput').value = '';
        loadRequests();
        loadSummary();
    });
    document.getElementById('btnCloseEdit').addEventListener('click', () => {
    document.getElementById('editOverlay').classList.add('hidden');
});
document.getElementById('btnEditCancel').addEventListener('click', () => {
    document.getElementById('editOverlay').classList.add('hidden');
});

    document.getElementById('btnExportExcel').addEventListener('click', exportExcel);

    document.getElementById('btnCloseView').addEventListener('click', () => {
        document.getElementById('viewOverlay').classList.add('hidden');
    });

    // ---------- Init ----------
    loadDepartments();
    loadSummary();
    loadRequests();
})();

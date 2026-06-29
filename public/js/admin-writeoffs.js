 const $ = (s) => document.querySelector(s);
    const API = '/api/write-offs';
    let token = sessionStorage.getItem('token');
    let currentUser = null;
    let inactivityTimer;

    // Таймер бездействия
    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            sessionStorage.removeItem('token');
            alert('Вы были разлогинены из-за бездействия');
            window.location.href = '/';
        }, 5 * 60 * 1000);
    }
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev => {
        document.addEventListener(ev, resetInactivityTimer);
    });
    resetInactivityTimer();

    // Проверка токена и роли
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
        Object.entries(params).forEach(([k,v]) => {
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
        } catch(e) {
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
                <td>
                    ${r.status === 'pending' ? `
                        <button class="btn btn-success btn-sm" onclick="resolve(${r.id},'approved')">✅</button>
                        <button class="btn btn-danger btn-sm" onclick="resolve(${r.id},'rejected')">❌</button>
                    ` : '<span style="font-size:0.8rem;">—</span>'}
                </td>
            </tr>
        `).join('');
    }

    async function resolve(id, status) {
        if (!confirm(`Подтвердить ${status === 'approved' ? 'списание' : 'отклонение'}?`)) return;
        try {
            const res = await fetch(`${API}/${id}`, {
                method: 'PATCH',
                headers: { ...authHeaders(), 'Content-Type':'application/json' },
                body: JSON.stringify({ status })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error);
            } else {
                loadRequests(getCurrentFilters());
            }
        } catch(e) {
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

    $('#applyFilter').addEventListener('click', () => loadRequests(getCurrentFilters()));
    $('#filterStatus').addEventListener('change', () => loadRequests(getCurrentFilters()));

    // Экспорт
    async function fetchAllForExport(filters) {
        const url = new URL(API, window.location.origin);
        Object.entries(filters).forEach(([k,v]) => {
            if (v) url.searchParams.set(k, v);
        });
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) throw new Error('Ошибка загрузки для экспорта');
        return await res.json();
    }

    function exportToExcel(data) {
        const exportData = data.map(r => ({
            'ID': r.id,
            'Код': r.item_code,
            'Наименование': r.item_name,
            'Количество': r.quantity,
            'Ед.изм.': r.unit,
            'Оборудование': r.equipment || '',
            'Запросил': r.requested_by,
            'Дата запроса': new Date(r.requested_at).toLocaleDateString('ru'),
            'Статус': r.status,
            'Дата решения': r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('ru') : '',
            'Комментарий': r.comment || ''
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Списания');
        XLSX.writeFile(wb, `spisaniya_${new Date().toISOString().slice(0,10)}.xlsx`);
        alert('Excel-отчёт сохранён');
    }

    function exportToCSV(data) {
        const headers = ['ID','Код','Наименование','Количество','Ед.изм.','Оборудование','Запросил','Дата запроса','Статус','Дата решения','Комментарий'];
        const rows = data.map(r => [
            r.id, r.item_code, r.item_name, r.quantity, r.unit,
            r.equipment || '', r.requested_by,
            new Date(r.requested_at).toLocaleDateString('ru'),
            r.status,
            r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('ru') : '',
            r.comment || ''
        ]);
        const csv = [headers, ...rows]
            .map(row => row.map(c => String(c).includes(';') ? `"${c}"` : c).join(';'))
            .join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `spisaniya_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        alert('CSV-отчёт сохранён');
    }

    $('#exportExcel').addEventListener('click', async () => {
        try {
            const filters = getCurrentFilters();
            const allData = await fetchAllForExport(filters);
            exportToExcel(allData);
        } catch(e) {
            alert('Ошибка экспорта: ' + e.message);
        }
    });

    $('#exportCSV').addEventListener('click', async () => {
        try {
            const filters = getCurrentFilters();
            const allData = await fetchAllForExport(filters);
            exportToCSV(allData);
        } catch(e) {
            alert('Ошибка экспорта: ' + e.message);
        }
    });

    // Отчёт за год
    $('#loadReport').addEventListener('click', async () => {
        const year = $('#reportYear').value;
        try {
            const res = await fetch(`${API}/report?year=${year}`, { headers: authHeaders() });
            const data = await res.json();
            let html = `<h3>${year} год</h3>`;
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
            $('#reportArea').innerHTML = html;
        } catch(e) {
            alert('Ошибка загрузки отчёта');
        }
    });

    $('#btnLogout').addEventListener('click', () => {
        sessionStorage.removeItem('token');
        window.location.href = '/';
    });

    // Запуск инициализации
    init();

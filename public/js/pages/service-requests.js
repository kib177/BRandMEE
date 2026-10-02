(function () {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/welcome.html'; return; }

    const API = '/api/service-requests';
    const INV_API = '/api/inventory';

    let currentData = [];
    let allInventory = [];
    let selectedParts = [];     // {id?, inventory_code, department_id, quantity, unit, note, item_name}
    let selectedFiles = [];     // {id, filename, original_name, mime_type, size}
    let currentViewId = null;

    const canManage = () =>
        currentUser && ['admin', 'moderator', 'storekeeper'].includes(currentUser.role);

    const statusLabel = (s) => ({
        draft: 'Черновик',
        submitted: 'Подана',
        approved: 'Согласована',
        in_progress: 'В работе',
        done: 'Закрыта',
        rejected: 'Отклонена',
        cancelled: 'Отменена'
    }[s] || s);

    // ---------- Загрузка справочников ----------
    async function loadEquipment() {
        try {
            const r = await fetch('/api/directories/equipment', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!r.ok) return;
            const eq = await r.json();
            const sel = document.getElementById('srEquipment');
            sel.innerHTML = '<option value="">— Не выбрано —</option>' +
                eq.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        } catch (e) { /* игнорируем */ }
    }

    async function loadInventory() {
        try {
            const r = await fetch(INV_API, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!r.ok) return;
            allInventory = await r.json();
        } catch (e) {
            allInventory = [];
        }
    }

    // ---------- Список ДЗ ----------
    async function loadList() {
        const params = new URLSearchParams();
        const st = document.getElementById('srFilterStatus').value;
        const q  = document.getElementById('srSearch').value.trim();
        if (st) params.append('status', st);
        if (q)  params.append('search', q);

        const r = await fetch(`${API}?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!r.ok) { alert('Ошибка загрузки'); return; }
        currentData = await r.json();
        renderTable();
        renderSummary();
    }

    function renderSummary() {
        const s = { total: currentData.length, draft: 0, in_progress: 0, approved: 0, done: 0, rejected: 0 };
        currentData.forEach(x => { if (s[x.status] !== undefined) s[x.status]++; });
        document.getElementById('srSumTotal').textContent      = s.total;
        document.getElementById('srSumDraft').textContent      = s.draft;
        document.getElementById('srSumInProgress').textContent = s.in_progress;
        document.getElementById('srSumApproved').textContent   = s.approved;
        document.getElementById('srSumDone').textContent       = s.done;
        document.getElementById('srSumRejected').textContent   = s.rejected;
    }

    function renderTable() {
        const tbody = document.querySelector('#srTable tbody');
        if (!currentData.length) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:2rem;">Нет ДЗ</td></tr>';
            return;
        }

        tbody.innerHTML = currentData.map(sr => `
            <tr class="status-${sr.status}" data-id="${sr.id}" style="cursor:pointer;">
                <td>${sr.id}</td>
                <td>${escapeHtml(sr.number || '—')}</td>
                <td>${new Date(sr.created_at).toLocaleDateString('ru')}</td>
                <td>${escapeHtml(sr.title)}</td>
                <td>${escapeHtml(sr.work_type || '—')}</td>
                <td>${escapeHtml(sr.location || '—')}</td>
                <td style="text-align:center;">${sr.parts_count || 0}</td>
                <td>${escapeHtml(sr.responsible || '—')}</td>
                <td>${sr.needed_by ? new Date(sr.needed_by).toLocaleDateString('ru') : '—'}</td>
                <td><span class="status-badge ${sr.status}">${statusLabel(sr.status)}</span></td>
                <td>
                    <button class="btn-icon js-view" data-id="${sr.id}" title="Открыть">👁️</button>
                    ${canManage() && sr.status !== 'done'
                        ? `<button class="btn-icon js-edit" data-id="${sr.id}" title="Редактировать">✏️</button>`
                        : ''}
                    ${canManage() && sr.status !== 'done'
                        ? `<button class="btn-icon js-delete" data-id="${sr.id}" title="Удалить" style="color:red;">🗑️</button>`
                        : ''}
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('tr[data-id]').forEach(tr => {
            tr.addEventListener('click', e => {
                if (e.target.closest('button, a, input, select, textarea')) return;
                openView(tr.dataset.id);
            });
        });
        tbody.querySelectorAll('.js-view').forEach(b =>
            b.addEventListener('click', () => openView(b.dataset.id)));
        tbody.querySelectorAll('.js-edit').forEach(b =>
            b.addEventListener('click', () => openForm(b.dataset.id)));
        tbody.querySelectorAll('.js-delete').forEach(b =>
            b.addEventListener('click', async () => {
                if (!confirm('Удалить ДЗ?')) return;
                const r = await fetch(`${API}/${b.dataset.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!r.ok) { alert((await r.json()).error || 'Ошибка'); return; }
                loadList();
            }));
    }

    // ---------- Создание / редактирование ----------
    document.getElementById('srBtnCreate').addEventListener('click', () => openForm(null));
    document.getElementById('srFormClose').addEventListener('click', closeForm);
    document.getElementById('srFormCancel').addEventListener('click', closeForm);

    function closeForm() {
        document.getElementById('srFormOverlay').classList.add('hidden');
    }

    async function openForm(id) {
        const f = document.getElementById('srForm');
        f.reset();
        document.getElementById('srId').value = '';
        document.getElementById('srFormTitle').textContent =
            id ? 'Редактирование ДЗ' : 'Новая докладная записка';

        await loadEquipment();

        if (id) {
            const r = await fetch(`${API}/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!r.ok) { alert('Не удалось открыть'); return; }
            const sr = await r.json();

            document.getElementById('srId').value          = sr.id;
            document.getElementById('srNumber').value      = sr.number || '';
            document.getElementById('srTitle').value       = sr.title || '';
            document.getElementById('srWorkType').value    = sr.work_type || '';
            document.getElementById('srDescription').value = sr.description || '';
            document.getElementById('srLocation').value    = sr.location || '';
            document.getElementById('srEquipment').value   = sr.equipment_id || '';
            document.getElementById('srResponsible').value = sr.responsible || '';
            document.getElementById('srNeededBy').value    =
                sr.needed_by ? sr.needed_by.slice(0, 10) : '';
        }

        document.getElementById('srFormOverlay').classList.remove('hidden');
    }

    document.getElementById('srForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('srId').value;

        const payload = {
            number:       document.getElementById('srNumber').value.trim(),
            title:        document.getElementById('srTitle').value.trim(),
            work_type:    document.getElementById('srWorkType').value,
            description:  document.getElementById('srDescription').value.trim(),
            location:     document.getElementById('srLocation').value.trim(),
            equipment_id: document.getElementById('srEquipment').value || null,
            responsible:  document.getElementById('srResponsible').value.trim(),
            needed_by:    document.getElementById('srNeededBy').value || null
        };

        if (!payload.number)    { alert('Введите номер ДЗ'); return; }
        if (!payload.work_type) { alert('Выберите вид работ'); return; }
        if (!payload.title)     { alert('Введите заголовок'); return; }

        const method = id ? 'PUT' : 'POST';
        const url    = id ? `${API}/${id}` : API;

        const r = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            alert(err.error || 'Ошибка сохранения');
            return;
        }
        closeForm();
        loadList();
    });

    // ---------- Просмотр карточки ----------
    document.getElementById('srViewClose').addEventListener('click', () => {
        document.getElementById('srViewOverlay').classList.add('hidden');
        currentViewId = null;
        selectedParts = [];
        selectedFiles = [];
    });

    async function openView(id) {
        currentViewId = id;

        const r = await fetch(`${API}/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!r.ok) { alert('Не удалось загрузить'); return; }
        const sr = await r.json();

        await loadInventory();

        selectedParts = (sr.parts || []).map(p => ({
            id: p.id,
            inventory_code: p.inventory_code,
            department_id: p.department_id,
            quantity: Number(p.quantity),
            unit: p.unit || '',
            note: p.note || '',
            item_name: p.item_name || p.inventory_code
        }));

        // Файлы берём либо из sr.files (если бэкенд уже отдаёт их в /:id),
        // либо отдельным запросом
        if (Array.isArray(sr.files)) {
            selectedFiles = sr.files;
        } else {
            try {
                const fr = await fetch(`${API}/${id}/files`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                selectedFiles = fr.ok ? await fr.json() : [];
            } catch {
                selectedFiles = [];
            }
        }

        renderView(sr);
        document.getElementById('srViewOverlay').classList.remove('hidden');
    }

    function renderView(sr) {
        const t = document.getElementById('srViewTitle');
        t.textContent = `ДЗ ${sr.number ? '№' + sr.number : '#' + sr.id}: ${sr.title}`;

        const statuses = ['draft','submitted','approved','in_progress','done','rejected','cancelled'];
        const statusSel = canManage() && sr.status !== 'done'
            ? `<select id="srStatusSelect" class="status-select">
                   ${statuses.map(s => `<option value="${s}" ${sr.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
               </select>
               <button class="btn btn-primary btn-sm" id="srStatusApply" style="margin-left:0.5rem;">Применить</button>`
            : `<span class="status-badge ${sr.status}">${statusLabel(sr.status)}</span>`;

        document.getElementById('srViewContent').innerHTML = `
            <p><b>Статус:</b> ${statusSel}</p>
            <p><b>Дата создания:</b> ${new Date(sr.created_at).toLocaleString('ru')}</p>
            <p><b>Автор:</b> ${escapeHtml(sr.author_name || sr.author_username || '—')}</p>
            <p><b>Вид работ:</b> ${escapeHtml(sr.work_type || '—')}</p>
            <p><b>Место, участок:</b> ${escapeHtml(sr.location || '—')}</p>
            <p><b>Оборудование:</b> ${escapeHtml(sr.equipment_name || '—')}</p>
            <p><b>Содержание работы:</b><br>${escapeHtml(sr.description || '—')}</p>
            <p><b>Ответственный:</b> ${escapeHtml(sr.responsible || '—')}</p>
            <p><b>Нужно к:</b> ${sr.needed_by ? new Date(sr.needed_by).toLocaleDateString('ru') : '—'}</p>

            <hr style="margin:1rem 0;">
            <h3 style="font-size:1rem;">Запчасти (${selectedParts.length})</h3>
            <div id="srPartsList"></div>
            ${canManage() && sr.status !== 'done' ? `
                <div style="margin-top:0.8rem; padding:0.8rem; background:var(--bg); border-radius:var(--radius-sm);">
                    <label style="font-size:0.8rem; font-weight:600;">Добавить запчасть:</label>
                    <input type="text" id="srPartSearch" placeholder="Поиск по коду/названию/артикулу"
                           style="width:100%; padding:0.4rem; margin:0.4rem 0;">
                    <div id="srPartResults"
                         style="max-height:180px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:#fafbfc;"></div>
                </div>
            ` : ''}

            <hr style="margin:1rem 0;">
            <h3 style="font-size:1rem;">Прикреплённые фото (${selectedFiles.length})</h3>
            <div id="srFilesList">${renderFilesHtml(sr)}</div>
            ${canManage() && sr.status !== 'done' ? `
                <div style="margin-top:0.6rem;">
                    <label class="btn btn-sm btn-outline" style="cursor:pointer;">
                        📎 Прикрепить файл
                        <input type="file" id="srFileInput" multiple style="display:none;">
                    </label>
                    <span id="srFileStatus" style="margin-left:0.5rem; font-size:0.85rem;"></span>
                </div>
            ` : ''}
        `;

        renderPartsList();
        bindStatusHandler(sr);
        bindPartSearch();
        bindFilesHandlers(sr);
    }

    // ---------- Обработчик смены статуса ----------
    function bindStatusHandler(sr) {
        document.getElementById('srStatusApply')?.addEventListener('click', async () => {
            const newStatus = document.getElementById('srStatusSelect').value;

            if (newStatus === 'done') {
                if (!confirm(
                    `Закрыть ДЗ? Все ${selectedParts.length} запчастей будут списаны со склада ` +
                    `и попадут в отчёт по списаниям с пометкой «ДЗ №${sr.number || sr.id}». Продолжить?`
                )) return;
            } else if (!confirm('Сменить статус?')) return;

            const r = await fetch(`${API}/${sr.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            const data = await r.json();
            if (!r.ok) { alert(data.error || 'Ошибка'); return; }

            if (newStatus === 'done' && data.writeoffsCreated) {
                alert(`ДЗ закрыта. Создано списаний: ${data.writeoffsCreated}`);
            }
            openView(sr.id);
            loadList();
        });
    }

    // ---------- Поиск запчастей ----------
    function bindPartSearch() {
        const partSearch  = document.getElementById('srPartSearch');
        const partResults = document.getElementById('srPartResults');
        if (!partSearch || !partResults) return;

        const renderResults = (q) => {
            const query = (q || '').toLowerCase().trim();
            const list = allInventory.filter(i =>
                !query ||
                (i.code  || '').toLowerCase().includes(query) ||
                (i.name  || '').toLowerCase().includes(query) ||
                (i.model || '').toLowerCase().includes(query)
            ).slice(0, 30);

            partResults.innerHTML = list.map(i => `
                <div class="sr-part-item"
                     data-code="${escapeHtml(i.code)}"
                     data-dept="${i.department_id}"
                     data-name="${escapeHtml(i.name)}"
                     data-unit="${escapeHtml(i.unit || '')}"
                     style="padding:0.4rem 0.6rem; cursor:pointer; border-bottom:1px solid var(--border);">
                    <b>${escapeHtml(i.code)}</b> — ${escapeHtml(i.name)}
                    ${i.model ? `<span style="color:var(--text-secondary);">[${escapeHtml(i.model)}]</span>` : ''}
                </div>
            `).join('') || '<div style="padding:0.6rem; color:#888;">Ничего не найдено</div>';

            partResults.querySelectorAll('.sr-part-item').forEach(el => {
                el.addEventListener('click', () => addPartFromElement(el));
            });
        };

        renderResults('');
        partSearch.addEventListener('input', e => renderResults(e.target.value));
    }

    // ---------- Список запчастей ----------
    function renderPartsList() {
        const container = document.getElementById('srPartsList');
        if (!container) return;
        if (!selectedParts.length) {
            container.innerHTML = '<p style="color:var(--text-secondary);">Запчасти не добавлены</p>';
            return;
        }
        container.innerHTML = selectedParts.map((p, idx) => `
            <div style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0; border-bottom:1px solid var(--border);">
                <div style="flex:1;">
                    <b>${escapeHtml(p.inventory_code)}</b> — ${escapeHtml(p.item_name || '')}
                    ${p.note ? `<div style="font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(p.note)}</div>` : ''}
                </div>
                <input type="number" class="sr-part-qty" data-idx="${idx}"
                       value="${p.quantity}" step="0.01" min="0.01"
                       style="width:80px; padding:0.2rem; text-align:right;">
                <span style="width:50px; font-size:0.8rem;">${escapeHtml(p.unit || '')}</span>
                <button class="btn-icon js-del-part" data-idx="${idx}" style="color:red;">🗑️</button>
            </div>
        `).join('');

        container.querySelectorAll('.sr-part-qty').forEach(inp => {
            inp.addEventListener('change', () => {
                const i = +inp.dataset.idx;
                selectedParts[i].quantity = parseFloat(inp.value) || 1;
            });
        });

        container.querySelectorAll('.js-del-part').forEach(btn => {
            btn.addEventListener('click', async () => {
                const i = +btn.dataset.idx;
                const p = selectedParts[i];
                if (p.id && currentViewId) {
                    await fetch(`${API}/${currentViewId}/parts/${p.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                }
                selectedParts.splice(i, 1);
                if (currentViewId) openView(currentViewId);
            });
        });
    }

    async function addPartFromElement(el) {
        const code = el.dataset.code;
        const dept = parseInt(el.dataset.dept);
        const name = el.dataset.name;
        const unit = el.dataset.unit || '';

        if (selectedParts.some(p => p.inventory_code === code && p.department_id === dept)) {
            alert('Такая запчасть уже добавлена');
            return;
        }

        const qty = parseFloat(prompt('Количество:', '1'));
        if (!qty || qty <= 0) return;

        const note = prompt('Примечание (необязательно):', '') || '';

        if (currentViewId) {
            const r = await fetch(`${API}/${currentViewId}/parts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    inventory_code: code,
                    department_id: dept,
                    quantity: qty,
                    unit,
                    note
                })
            });
            if (!r.ok) {
                alert((await r.json()).error || 'Ошибка');
                return;
            }
        }

        selectedParts.push({
            inventory_code: code,
            department_id: dept,
            quantity: qty,
            unit,
            note,
            item_name: name
        });
        openView(currentViewId);
    }

    // ---------- Файлы ----------
    function renderFilesHtml(sr) {
        if (!selectedFiles.length) {
            return '<p style="color:var(--text-secondary);">Файлы не прикреплены</p>';
        }
        const canDelete = canManage() && sr.status !== 'done';
        return selectedFiles.map(f => {
            const url = `/uploads/sr/${encodeURIComponent(f.filename)}`;
            return `
                <div style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0; border-bottom:1px solid var(--border);">
                    <a href="${url}" target="_blank"
                       style="flex:1; color:var(--accent); text-decoration:underline;">
                        ${escapeHtml(f.original_name)}
                    </a>
                    <span style="font-size:0.78rem; color:var(--text-secondary);">
                        ${formatSize(f.size)}
                    </span>
                    ${canDelete
                        ? `<button class="btn-icon js-del-sr-file" data-file-id="${f.id}" style="color:red;">🗑️</button>`
                        : ''}
                </div>
            `;
        }).join('');
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        const kb = bytes / 1024;
        return kb < 1024
            ? `${kb.toFixed(1)} KB`
            : `${(kb / 1024).toFixed(1)} MB`;
    }

    function bindFilesHandlers(sr) {
        const fileInput = document.getElementById('srFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const files = e.target.files;
                if (!files.length) return;

                const fd = new FormData();
                for (const f of files) fd.append('files', f);

                const status = document.getElementById('srFileStatus');
                status.textContent = 'Загрузка…';

                const r = await fetch(`${API}/${sr.id}/files`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd
                });
                if (!r.ok) {
                    status.textContent = 'Ошибка';
                    const err = await r.json().catch(() => ({}));
                    alert(err.error || 'Ошибка загрузки');
                    return;
                }
                status.textContent = 'Загружено';
                openView(sr.id);
            });
        }

        document.querySelectorAll('.js-del-sr-file').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Удалить файл?')) return;
                const r = await fetch(`${API}/${sr.id}/files/${btn.dataset.fileId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    alert(err.error || 'Ошибка');
                    return;
                }
                openView(sr.id);
            });
        });
    }

    // ---------- Фильтры ----------
    document.getElementById('srBtnApply').addEventListener('click', loadList);
    document.getElementById('srBtnReset').addEventListener('click', () => {
        document.getElementById('srFilterStatus').value = '';
        document.getElementById('srSearch').value = '';
        loadList();
    });

    // ---------- Init ----------
    loadList();
})();

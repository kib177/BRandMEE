// modals.js – управление модальными окнами (добавление, редактирование, просмотр, подтверждения)

// ========== МОДАЛКА ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ ==========
function openAddModal() {
    $('#formMode').value = 'add';
    $('#formOriginalCode').value = '';
    $('#modalTitle').textContent = 'Добавить позицию';

    ['formCode','formName','formModel','formLocation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const typeSel = document.getElementById('formType');
    if (typeSel) typeSel.value = '';

    // Очищаем мультиселект
    const equipSel = document.getElementById('formEquipments');
    if (equipSel) {
        for (const opt of equipSel.options) opt.selected = false;
    }

    const unitSel = document.getElementById('formUnit');
    if (unitSel) unitSel.value = 'ШТ';
    const qtyEl = document.getElementById('formQty');
    if (qtyEl) qtyEl.value = '1,00';
    const dateEl = document.getElementById('formDate');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    const codeEl = document.getElementById('formCode');
    if (codeEl) codeEl.readOnly = false;

    $('#modalOverlay').classList.remove('hidden');
}

async function openEditModal(code) {
    const item = inventory.find(i => i.code === code);
    if (!item) return;

    let equipmentIds = [];
    try {
        const res = await fetch(`/api/inventory/${encodeURIComponent(code)}`);
        if (res.ok) {
            const fullItem = await res.json();
            equipmentIds = fullItem.equipment_ids || [];
        }
    } catch (e) {}

    $('#formMode').value = 'edit';
    $('#formOriginalCode').value = item.code;
    $('#modalTitle').textContent = 'Редактировать';

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    setVal('formCode', item.code);
    document.getElementById('formCode').readOnly = true;
    setVal('formName', item.name);
    setVal('formModel', item.model);
    setSelectWithFallback('formType', item.type_id, item.type_name);

    const equipSelect = document.getElementById('formEquipments');
    if (equipSelect) {
        for (const opt of equipSelect.options) {
            opt.selected = equipmentIds.includes(parseInt(opt.value));
        }
    }

    setVal('formLocation', item.location || '');
    setVal('formUnit', item.unit);
    setVal('formQty', item.quantity.toString().replace('.', ','));
    const parts = item.date.split('.');
    setVal('formDate', parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '');

    $('#modalOverlay').classList.remove('hidden');
}

async function submitForm(e) {
    e.preventDefault();
    const mode = $('#formMode').value;
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

    const equipSelect = document.getElementById('formEquipments');
    const selectedEquipmentIds = equipSelect
        ? Array.from(equipSelect.selectedOptions).map(opt => parseInt(opt.value))
        : [];

    const item = {
        code: getVal('formCode').trim(),
        name: getVal('formName').trim(),
        model: getVal('formModel').trim(),
        type_id: getVal('formType') || null,
        equipment_ids: selectedEquipmentIds,
        location: getVal('formLocation').trim(),
        unit: getVal('formUnit') || 'ШТ',
        quantity: parseFloat((getVal('formQty') || '0').replace(',', '.')),
        date: getVal('formDate').split('-').reverse().join('.')
    };

    await saveItem(item);
    $('#modalOverlay').classList.add('hidden');
    await loadData();
    showToast(mode === 'add' ? 'Добавлено' : 'Обновлено');
}

// ========== МОДАЛКА ПРОСМОТРА ПОЗИЦИИ ==========
function showItemDetails(code) {
    const item = inventory.find(i => i.code === code);
    if (!item) return;

    const typeName = item.type_name || getTypeName(item.type_id);
    const equipName = item.equipment_name || '—';

    const canManageFiles = currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator' || currentUser.role === 'storekeeper');

    let filesBlockHtml = '';
    if (canManageFiles) {
        filesBlockHtml = `
            <div id="partFilesBlock" style="margin-top: 1rem;">
                <strong>Прикреплённые файлы:</strong>
                <div id="filesList" style="margin-top: 0.5rem;"></div>
                <div style="margin-top: 0.8rem;">
                    <label class="btn btn-sm btn-outline" style="cursor:pointer;">
                        ➕ Добавить файлы
                        <input type="file" id="fileInput" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style="display:none;">
                    </label>
                    <span id="uploadStatus" style="margin-left: 0.5rem; font-size: 0.85rem;"></span>
                </div>
            </div>`;
    } else {
        filesBlockHtml = `
            <div id="partFilesBlock" style="margin-top: 1rem;">
                <strong>Прикреплённые файлы:</strong>
                <div id="filesList" style="margin-top: 0.5rem;"></div>
            </div>`;
    }

    $('#viewModalTitle').textContent = `Позиция ${item.code}`;
    $('#viewModalContent').innerHTML = `
        <p><strong>Код:</strong> ${escapeHtml(item.code)}</p>
        <p><strong>Наименование:</strong> ${escapeHtml(item.name)}</p>
        <p><strong>Модель:</strong> ${escapeHtml(item.model || '—')}</p>
        <p><strong>Тип:</strong> ${escapeHtml(typeName)}</p>
        <p><strong>Оборудование:</strong> ${escapeHtml(equipName)}</p>
        <p><strong>Расположение:</strong> ${escapeHtml(item.location || '—')}</p>
        <p><strong>Ед. изм.:</strong> ${escapeHtml(item.unit)}</p>
        <p><strong>Количество:</strong> ${formatQty(item.quantity)}</p>
        <p><strong>Дата:</strong> ${escapeHtml(item.date)}</p>
        ${filesBlockHtml}
    `;

    const btnInfo = document.getElementById('btnPartInfo');
    if (btnInfo) {
        btnInfo.style.display = 'inline-flex';
        btnInfo.onclick = () => fetchPartInfo(item.model, item.name);
    }

    const btnWriteOff = document.getElementById('btnWriteOffFromView');
    if (btnWriteOff) {
        btnWriteOff.style.display = 'inline-flex';
        btnWriteOff.onclick = () => {
            window.location.href = `/writeoff.html?code=${encodeURIComponent(code)}`;
        };
    }

    const btnEditFromView = document.getElementById('btnEditFromView');
if (btnEditFromView) {
    const canEditItem = currentUser && (
        currentUser.role === 'admin' ||
        currentUser.role === 'moderator' ||
        currentUser.role === 'storekeeper'
    );
    if (canEditItem) {
        btnEditFromView.style.display = 'inline-flex';
        btnEditFromView.onclick = () => {
            // Закрываем карточку просмотра и открываем модалку редактирования
            document.getElementById('viewModalOverlay').classList.add('hidden');
            openEditModal(code);
        };
    } else {
        btnEditFromView.style.display = 'none';
    }
}

    // Загружаем список файлов с учётом прав
    loadFilesList(item.code, canManageFiles);

    // Если есть права, навешиваем обработчик загрузки
    if (canManageFiles) {
        const oldFileInput = document.getElementById('fileInput');
        if (oldFileInput) {
            const newFileInput = oldFileInput.cloneNode(true);
            oldFileInput.parentNode.replaceChild(newFileInput, oldFileInput);

            newFileInput.addEventListener('change', async (e) => {
                const files = e.target.files;
                if (!files.length) return;

                const status = document.getElementById('uploadStatus');
                status.textContent = 'Загрузка...';

                const formData = new FormData();
                for (let file of files) {
                    formData.append('files', file);
                }

                try {
                    const res = await fetch(`/api/inventory/files/${encodeURIComponent(item.code)}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: formData
                    });
                    if (!res.ok) {
                        const text = await res.text();
                        let message;
                        try {
                            const err = JSON.parse(text);
                            message = err.error || 'Ошибка загрузки';
                        } catch {
                            message = text || 'Ошибка загрузки';
                        }
                        throw new Error(message);
                    }
                    status.textContent = 'Файлы загружены';
                    loadFilesList(item.code, canManageFiles);
                } catch (err) {
                    status.textContent = 'Ошибка: ' + err.message;
                }
                e.target.value = '';
            });
        }
    }

    $('#viewModalOverlay').classList.remove('hidden');
}

// ========== МОДАЛКА СТАТИСТИКИ СПИСАНИЙ ==========
async function showItemStats(code) {
    const overlay = document.getElementById('itemStatsOverlay');
    const content = document.getElementById('itemStatsContent');
    const title   = document.getElementById('itemStatsTitle');
    if (!overlay || !content) return;

    title.textContent = `Статистика списаний: ${code}`;
    content.innerHTML = '<p>Загрузка…</p>';
    overlay.classList.remove('hidden');

    try {
        const res = await fetch(`/api/write-offs/item/${encodeURIComponent(code)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) throw new Error('Не удалось загрузить статистику');
        const data = await res.json();
        renderItemStats(data);
    } catch (e) {
        content.innerHTML = `<p style="color:var(--danger);">${e.message}</p>`;
    }
}

function renderItemStats(data) {
    const content = document.getElementById('itemStatsContent');
    if (!content) return;

    const t = data.totals || {};
    const item = data.item || {};

    let html = '';

    // Плашка с позицией
    if (item.name) {
        html += `
            <div style="background:var(--accent-light); padding:0.8rem 1rem; border-radius:var(--radius-sm); margin-bottom:1rem;">
                <div style="font-weight:700;">${escapeHtml(item.name)}</div>
                <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:0.15rem;">
                    Код: ${escapeHtml(item.code)}
                    ${item.model ? ' · Артикул: ' + escapeHtml(item.model) : ''}
                </div>
                <div style="font-size:0.85rem; margin-top:0.35rem;">
                    Текущий остаток: <b>${formatQty(item.quantity)}</b> ${escapeHtml(item.unit || '')}
                </div>
            </div>
        `;
    }

    // Сводка
    html += `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:0.5rem; margin-bottom:1rem;">
            <div style="padding:0.6rem 0.8rem; background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius-sm);">
                <div style="font-size:0.68rem; color:var(--text-secondary); text-transform:uppercase;">Всего заявок</div>
                <div style="font-size:1.25rem; font-weight:700;">${t.total_count || 0}</div>
            </div>
            <div style="padding:0.6rem 0.8rem; background:var(--success-light); border-radius:var(--radius-sm);">
                <div style="font-size:0.68rem; color:var(--text-secondary); text-transform:uppercase;">Списано</div>
                <div style="font-size:1.25rem; font-weight:700; color:var(--success);">${formatQty(Number(t.total_qty_approved) || 0)}</div>
            </div>
            <div style="padding:0.6rem 0.8rem; background:var(--warning-bg); border-radius:var(--radius-sm);">
                <div style="font-size:0.68rem; color:var(--text-secondary); text-transform:uppercase;">В ожидании</div>
                <div style="font-size:1.25rem; font-weight:700; color:#856404;">${formatQty(Number(t.total_qty_pending) || 0)}</div>
            </div>
            <div style="padding:0.6rem 0.8rem; background:var(--danger-light); border-radius:var(--radius-sm);">
                <div style="font-size:0.68rem; color:var(--text-secondary); text-transform:uppercase;">Отклонено</div>
                <div style="font-size:1.25rem; font-weight:700; color:var(--danger);">${t.rejected_count || 0}</div>
            </div>
        </div>
    `;

    // По месяцам
    if (data.byMonth && data.byMonth.length) {
        const max = Math.max(...data.byMonth.map(m => Number(m.total_qty) || 0));
        html += `<h3 style="font-size:0.95rem; margin:0.5rem 0;">Списания по месяцам</h3>`;
        html += `<div style="margin-bottom:1rem;">`;
        data.byMonth.forEach(m => {
            const val = Number(m.total_qty) || 0;
            const pct = max ? Math.round(val / max * 100) : 0;
            html += `
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem; font-size:0.8rem;">
                    <div style="width:70px; color:var(--text-secondary);">${escapeHtml(m.month)}</div>
                    <div style="flex:1; background:var(--bg); height:14px; border-radius:7px; overflow:hidden;">
                        <div style="background:var(--accent); height:100%; width:${pct}%;"></div>
                    </div>
                    <div style="width:60px; text-align:right;">${formatQty(val)}</div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // По оборудованию
    if (data.byEquipment && data.byEquipment.length) {
        html += `<h3 style="font-size:0.95rem; margin:0.5rem 0;">По оборудованию</h3>`;
        html += `<table style="width:100%; font-size:0.85rem; border-collapse:collapse; margin-bottom:1rem;">
            <thead><tr>
                <th style="text-align:left; padding:0.4rem; border-bottom:1px solid var(--border);">Оборудование</th>
                <th style="text-align:right; padding:0.4rem; border-bottom:1px solid var(--border);">Списано</th>
                <th style="text-align:right; padding:0.4rem; border-bottom:1px solid var(--border);">Заявок</th>
            </tr></thead><tbody>`;
        data.byEquipment.forEach(e => {
            html += `<tr>
                <td style="padding:0.4rem;">${escapeHtml(e.equipment || 'Без указания')}</td>
                <td style="padding:0.4rem; text-align:right;">${formatQty(Number(e.total_qty) || 0)}</td>
                <td style="padding:0.4rem; text-align:right;">${e.count}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    // Последние операции
    if (data.last && data.last.length) {
        html += `<h3 style="font-size:0.95rem; margin:0.5rem 0;">Последние ${data.last.length} операций</h3>`;
        html += `<div style="max-height: 280px; overflow-y:auto;">`;
        html += `<table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
            <thead><tr>
                <th style="text-align:left; padding:0.4rem; border-bottom:1px solid var(--border);">Дата</th>
                <th style="text-align:right; padding:0.4rem; border-bottom:1px solid var(--border);">Кол-во</th>
                <th style="text-align:left; padding:0.4rem; border-bottom:1px solid var(--border);">Оборудование</th>
                <th style="text-align:left; padding:0.4rem; border-bottom:1px solid var(--border);">Статус</th>
                <th style="text-align:left; padding:0.4rem; border-bottom:1px solid var(--border);">Кто</th>
            </tr></thead><tbody>`;
        data.last.forEach(r => {
            const color = r.status === 'approved' ? 'var(--success)'
                        : r.status === 'rejected' ? 'var(--danger)'
                        : '#856404';
            const text = r.status === 'approved' ? 'Списано'
                        : r.status === 'rejected' ? 'Отклонено'
                        : 'Ожидает';
            html += `<tr>
                <td style="padding:0.4rem; white-space:nowrap;">${new Date(r.requested_at).toLocaleDateString('ru')}</td>
                <td style="padding:0.4rem; text-align:right;">${formatQty(Number(r.quantity))} ${escapeHtml(r.unit || '')}</td>
                <td style="padding:0.4rem;">${escapeHtml(r.equipment_name || '—')}</td>
                <td style="padding:0.4rem; color:${color};">${text}</td>
                <td style="padding:0.4rem;">${escapeHtml(r.requested_by || '—')}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    } else {
        html += `<p style="color:var(--text-secondary); margin-top:0.5rem;">Списаний по этой позиции пока не было.</p>`;
    }

    content.innerHTML = html;
}

// Загрузка списка файлов для позиции
async function loadFilesList(code, canManageFiles = false) {
    const filesContainer = document.getElementById('filesList');
    if (!filesContainer) return;

    try {
        const res = await fetch(`/api/inventory/files/${encodeURIComponent(code)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Ошибка загрузки списка файлов');
        }
        const files = await res.json();

        if (!files.length) {
            filesContainer.innerHTML = '<span style="color: #888;">Нет файлов</span>';
            return;
        }

        filesContainer.innerHTML = files.map(f => {
            const isImage = f.mime_type?.startsWith('image/');
            const url = `/uploads/${f.filename}`;
            const preview = isImage
                ? `<img src="${url}" class="file-thumbnail" data-url="${url}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; margin-right: 0.3rem; cursor: pointer;">`
                : `<span class="file-thumbnail" data-url="${url}" style="font-size: 2rem; cursor: pointer;">📄</span>`;

            const deleteButton = canManageFiles
                ? `<button class="btn-icon delete-file-btn" data-code="${code}" data-file-id="${f.id}" title="Удалить" style="color: red;">🗑️</button>`
                : '';

            return `<div style="display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.3rem;">
                ${preview}
                <span style="font-size: 0.8rem;">${f.original_name} (${formatSize(f.size)})</span>
                ${deleteButton}
            </div>`;
        }).join('');
    } catch (e) {
        filesContainer.innerHTML = '<span style="color: red;">Ошибка загрузки файлов</span>';
    }
}

// Глобальный обработчик кликов: удаление файлов и открытие превью
document.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-file-btn');
    if (deleteBtn) {
        const code = deleteBtn.dataset.code;
        const fileId = deleteBtn.dataset.fileId;
        if (code && fileId) {
            deleteFile(code, fileId);
        }
    }

    const thumbnail = e.target.closest('.file-thumbnail');
    if (thumbnail) {
        const url = thumbnail.dataset.url;
        if (url) {
            const isImage = thumbnail.tagName === 'IMG';
            if (isImage) {
                openImageViewer(url);
            } else {
                window.open(url, '_blank');
            }
        }
    }
});

function openImageViewer(src) {
    const oldOverlay = document.getElementById('imageViewerOverlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'imageViewerOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'display: flex; align-items: center; justify-content: center; z-index: 1000;';

    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

    overlay.appendChild(img);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => overlay.remove());
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

async function deleteFile(code, fileId) {
    if (!confirm('Удалить файл?')) return;
    try {
        const res = await fetch(`/api/inventory/files/${encodeURIComponent(code)}/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) {
            const text = await res.text();
            let message;
            try {
                const err = JSON.parse(text);
                message = err.error || 'Ошибка удаления';
            } catch {
                message = text || 'Ошибка удаления';
            }
            throw new Error(message);
        }
        loadFilesList(code, true); // после удаления перезагружаем с canManageFiles=true, так как у пользователя есть права (кнопка удаления была видна)
    } catch (e) {
        alert('Ошибка: ' + e.message);
    }
}

function formatSize(bytes) {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

// ========== МОДАЛКИ ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ==========
let pendingDeleteCode = null;

function openConfirmDelete(code) {
    pendingDeleteCode = code;
    $('#confirmMessage').textContent = `Удалить ${code}?`;
    $('#confirmOverlay').classList.remove('hidden');
}

async function executeDelete() {
    if (pendingDeleteCode) {
        const item = inventory.find(i => i.code === pendingDeleteCode);
        await deleteItem(pendingDeleteCode, item?.department_id);
        pendingDeleteCode = null;
        await loadData();
        showToast('Удалено');
    }
    $('#confirmOverlay').classList.add('hidden');
}

function openConfirmDeleteAll() {
    $('#confirmDeleteAllOverlay').classList.remove('hidden');
}

async function executeDeleteAll() {
    await deleteAllItems();
    $('#confirmDeleteAllOverlay').classList.add('hidden');
    await loadData();
    showToast('Всё удалено');
}

function setSelectWithFallback(selectId, valueId, valueName) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;
    selectEl.value = valueId || '';
    if (valueId && selectEl.value !== String(valueId)) {
        const option = document.createElement('option');
        option.value = valueId;
        option.textContent = valueName || `ID ${valueId}`;
        selectEl.appendChild(option);
        selectEl.value = valueId;
    }
}

function fetchPartInfo(model, name) {
    const searchTerm = (model && model.trim()) ? model.trim() : name;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}+datasheet`;
    window.open(googleUrl, '_blank');
}

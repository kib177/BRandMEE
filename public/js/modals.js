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
        </div>
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

    // Загружаем список файлов
    loadFilesList(item.code);

    // Полностью заменяем fileInput, чтобы избежать дублирования обработчиков
    const oldFileInput = document.getElementById('fileInput');
    const newFileInput = oldFileInput.cloneNode(true);
    oldFileInput.parentNode.replaceChild(newFileInput, oldFileInput);

    newFileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    const status = document.getElementById('uploadStatus');
    status.textContent = 'Загрузка...';

    const formData = new FormData();
    for (let file of files) {
        formData.append('files', file);   // просто добавляем оригинал
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
        loadFilesList(item.code);
    } catch (err) {
        status.textContent = 'Ошибка: ' + err.message;
    }
    e.target.value = '';
});

    $('#viewModalOverlay').classList.remove('hidden');
}


// Загрузка списка файлов для позиции (без inline-обработчиков)
async function loadFilesList(code) {
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

            return `<div style="display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.3rem;">
                ${preview}
                <span style="font-size: 0.8rem;">${f.original_name} (${formatSize(f.size)})</span>
                <button class="btn-icon delete-file-btn" data-code="${code}" data-file-id="${f.id}" title="Удалить" style="color: red;">🗑️</button>
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
        loadFilesList(code);
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
        await deleteItem(pendingDeleteCode);
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

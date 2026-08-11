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

    // Получаем полные данные с сервера, чтобы узнать привязанные оборудования
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

    // Устанавливаем выбранные оборудования в мультиселект
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
        equipment_ids: selectedEquipmentIds,          // ← передаём массив
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
            <div id="filesList" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;"></div>
            <div style="margin-top: 0.5rem;">
                <input type="file" id="fileInput" multiple style="display: none;">
                <button class="btn btn-sm btn-outline" id="btnAddFiles">➕ Добавить файлы</button>
            </div>
        </div>
    `;

    // Загружаем список файлов
    loadFilesList(code);

    // Обработчик кнопки добавления файлов
    document.getElementById('btnAddFiles').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch(`/api/inventory/${encodeURIComponent(code)}/files`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: formData
                });
                if (res.ok) {
                    await loadFilesList(code);
                }
            } catch (err) {
                console.error('Ошибка загрузки файла:', err);
            }
        }
        e.target.value = '';
    });

    // Остальные кнопки (инфо, списание)
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

    $('#viewModalOverlay').classList.remove('hidden');
}

async function loadFilesList(code) {
    const filesDiv = document.getElementById('filesList');
    if (!filesDiv) return;

    try {
        const res = await fetch(`/api/inventory/${encodeURIComponent(code)}/files`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const files = await res.json();

        filesDiv.innerHTML = files.map(f => {
            const isImage = f.mime_type?.startsWith('image/');
            const fileUrl = `/uploads/${f.filename}`;
            
            if (isImage) {
                return `<div style="position: relative; display: inline-block; margin: 4px;">
                    <a href="${fileUrl}" target="_blank" title="${f.original_name}">
                        <img src="${fileUrl}" style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">
                    </a>
                    <button class="btn-delete-file" data-fileid="${f.id}" data-code="${code}" style="position: absolute; top: -8px; right: -8px; background: #ff4444; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; line-height: 1;">×</button>
                </div>`;
            } else {
                return `<div style="position: relative; display: inline-block; margin: 4px; text-align: center; width: 100px;">
                    <a href="${fileUrl}" target="_blank" title="${f.original_name}" style="display: block; padding: 10px; background: #f0f0f0; border-radius: 4px; text-decoration: none; color: #333;">
                        <div style="font-size: 24px;">📄</div>
                        <div style="font-size: 10px; word-break: break-all;">${f.original_name.length > 15 ? f.original_name.substring(0, 12) + '…' : f.original_name}</div>
                    </a>
                    <button class="btn-delete-file" data-fileid="${f.id}" data-code="${code}" style="position: absolute; top: -8px; right: -8px; background: #ff4444; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; line-height: 1;">×</button>
                </div>`;
            }
        }).join('');

        // Обработчики удаления
        document.querySelectorAll('.btn-delete-file').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fileId = btn.dataset.fileid;
                const code = btn.dataset.code;
                if (confirm('Удалить файл?')) {
                    try {
                        const res = await fetch(`/api/inventory/${encodeURIComponent(code)}/files/${fileId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                        });
                        if (res.ok) {
                            loadFilesList(code);
                        }
                    } catch (err) {
                        console.error('Ошибка удаления файла:', err);
                    }
                }
            });
        });
    } catch (err) {
        console.error('Ошибка загрузки списка файлов:', err);
    }
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
// Поиск информации о запчасти (открывает Google)
function fetchPartInfo(model, name) {
    const searchTerm = (model && model.trim()) ? model.trim() : name;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}+datasheet`;
    window.open(googleUrl, '_blank');
}

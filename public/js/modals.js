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
    // equipment_name теперь содержит несколько названий через ";"
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

    $('#viewModalOverlay').classList.remove('hidden');
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

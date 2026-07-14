// modals.js – управление модальными окнами (добавление, редактирование, просмотр, подтверждения)

// ========== МОДАЛКА ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ ==========
function openAddModal() {
    $('#formMode').value = 'add';
    $('#formOriginalCode').value = '';
    $('#modalTitle').textContent = 'Добавить позицию';

    ['formCode','formName','formModel','formLocation'].forEach(id => {
        const el = $('#' + id);
        if (el) el.value = '';
    });

    const typeSel = $('#formType');
    if (typeSel) typeSel.value = '';
    const equipSel = $('#formEquipment');
    if (equipSel) equipSel.value = '';
    const unitSel = $('#formUnit');
    if (unitSel) unitSel.value = 'ШТ';
    const qtyEl = $('#formQty');
    if (qtyEl) qtyEl.value = '1,00';
    const dateEl = $('#formDate');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    const codeEl = $('#formCode');
    if (codeEl) codeEl.readOnly = false;

    $('#modalOverlay').classList.remove('hidden');
}

function openEditModal(code) {
    const item = inventory.find(i => i.code === code);
    if (!item) return;

    $('#formMode').value = 'edit';
    $('#formOriginalCode').value = item.code;
    $('#modalTitle').textContent = 'Редактировать';

    const setVal = (id, val) => {
        const el = $('#' + id);
        if (el) el.value = val;
    };

    setVal('formCode', item.code);
    $('#formCode').readOnly = true;
    setVal('formName', item.name);
    setVal('formModel', item.model);
    setSelectWithFallback('formType', item.type_id, item.type_name);
    setSelectWithFallback('formEquipment', item.equipment_id, item.equipment_name);
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
    const getVal = (sel) => { const el = $(sel); return el ? el.value : ''; };

    const item = {
        code: getVal('#formCode').trim(),
        name: getVal('#formName').trim(),
        model: getVal('#formModel').trim(),
        type_id: getVal('#formType') || null,
        equipment_id: getVal('#formEquipment') || null,
        location: getVal('#formLocation').trim(),
        unit: getVal('#formUnit') || 'ШТ',
        quantity: parseFloat((getVal('#formQty') || '0').replace(',', '.')),
        date: getVal('#formDate').split('-').reverse().join('.')
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
    const equipName = item.equipment_name || getEquipmentName(item.equipment_id);

    $('#viewModalTitle').textContent = `Позиция ${item.code}`;
    $('#viewModalContent').innerHTML = `
        <p><strong>Код:</strong> ${escapeHtml(item.code)}</p>
        <p><strong>Наименование:</strong> ${escapeHtml(item.name)}</p>
        <p><strong>Артикул:</strong> ${escapeHtml(item.model || '—')}</p>
        <p><strong>Тип:</strong> ${escapeHtml(typeName)}</p>
        <p><strong>Оборудование:</strong> ${escapeHtml(equipName)}</p>
        <p><strong>Расположение:</strong> ${escapeHtml(item.location || '—')}</p>
        <p><strong>Ед. изм.:</strong> ${escapeHtml(item.unit)}</p>
        <p><strong>Количество:</strong> ${formatQty(item.quantity)}</p>
        <p><strong>Дата:</strong> ${escapeHtml(item.date)}</p>
        <div id="partInfoBlock" style="margin-top: 1rem;"></div>
    `;

    // Кнопка «ℹ️ Инфо»
    const btnInfo = $('#btnPartInfo');
    if (btnInfo) {
        btnInfo.style.display = 'inline-flex';
        btnInfo.onclick = () => fetchPartInfo(item.model, item.name);
    }

    // Даташит (если осталась кнопка – можно оставить)
    const btnDatasheet = $('#btnDatasheet');
    if (btnDatasheet) {
        const datasheetUrl = `/datasheets/${encodeURIComponent(item.code)}.pdf`;
        btnDatasheet.href = datasheetUrl;
        btnDatasheet.style.display = 'none'; // или показывать, если нужно
    }

    const btnWriteOff = $('#btnWriteOffFromView');
    if (btnWriteOff) {
        btnWriteOff.style.display = 'inline-flex';
        btnWriteOff.onclick = () => {
            window.location.href = `/writeoff.html?code=${encodeURIComponent(code)}`;
        };
    }

    $('#viewModalOverlay').classList.remove('hidden');
}

// Функция запроса информации о детали
async function fetchPartInfo(model, name) {
    const block = $('#partInfoBlock');
    const searchTerm = model && model.trim() ? model.trim() : name;  // приоритет – артикул
    block.innerHTML = `<p>Поиск информации по: "${searchTerm}"...</p>`;

    try {
        const res = await fetch(`/api/part-info/${encodeURIComponent(searchTerm)}`);
        if (!res.ok) throw new Error('Ошибка запроса');
        const data = await res.json();

        if (!data.found) {
            block.innerHTML = `<p>Информация не найдена. Попробуйте вручную поискать на <a href="https://www.google.com/search?q=${encodeURIComponent(name || searchTerm)}+datasheet" target="_blank">Google</a>.</p>`;
            return;
        }

        block.innerHTML = `
            <div style="background: #f8f9fb; padding: 0.8rem; border-radius: 6px; border: 1px solid #ddd;">
                <strong>${escapeHtml(data.title)}</strong>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">${escapeHtml(data.description)}</p>
                <a href="${data.pageUrl}" target="_blank" class="btn btn-sm btn-outline" style="margin-top: 0.5rem;">Открыть статью</a>
            </div>
        `;
    } catch (e) {
        console.error(e);
        block.innerHTML = '<p style="color:red;">Не удалось загрузить информацию. Проверьте подключение к интернету.</p>';
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
    const select = $('#' + selectId);
    if (!select) return;
    // Сначала пробуем установить как есть
    select.value = valueId || '';
    // Если значение не выбралось (нет такого option), добавляем
    if (valueId && select.value !== String(valueId)) {
        const option = document.createElement('option');
        option.value = valueId;
        option.textContent = valueName || `ID ${valueId}`;
        select.appendChild(option);
        select.value = valueId;
    }
}

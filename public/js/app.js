let inventory = [];

async function loadData() {
    try {
        inventory = await fetchInventory();
    } catch {
        inventory = [];
        showToast('Сервер недоступен', 'error');
    }
    applyFilterAndRender();
}

function applyFilterAndRender() {
    applyFilters(inventory);
    // Сбрасываем выделение, если выбранная строка исчезла
    if (selectedRowCode && !filteredInventory.some(item => item.code === selectedRowCode)) {
        selectedRowCode = null;
    }
    renderTable(filteredInventory);
    updateStats(inventory);
    populateFilters(inventory);
}

// Модалки
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

    $('#formCode').value = item.code; 
    $('#formCode').readOnly = true;
    $('#formName').value = item.name;
    $('#formModel').value = item.model;

    const typeSel = $('#formType');
    if (typeSel) typeSel.value = item.type_id || '';
    const equipSel = $('#formEquipment');
    if (equipSel) equipSel.value = item.equipment_id || '';

    $('#formLocation').value = item.location || '';
    $('#formUnit').value = item.unit;
    $('#formQty').value = item.quantity.toString().replace('.', ',');
    const parts = item.date.split('.');
    $('#formDate').value = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';

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

function openConfirmDeleteAll() { $('#confirmDeleteAllOverlay').classList.remove('hidden'); }
async function executeDeleteAll() {
    await deleteAllItems();
    $('#confirmDeleteAllOverlay').classList.add('hidden');
    await loadData();
    showToast('Всё удалено');
}

// Функция, выполняющая действие после проверки прав
function executeAction(action, data) {
    switch (action) {
        case 'add': openAddModal(); break;
        case 'edit': openEditModal(data); break;
        case 'delete': openConfirmDelete(data); break;
        case 'deleteAll': openConfirmDeleteAll(); break;
        case 'import': $('#importFileInput').click(); break;
        case 'writeoff': window.location.href = `/writeoff.html?code=${encodeURIComponent(data)}`; break;
    }
}

function requireAuth(action, data) {
    if (!currentUser) {
        showLoginModal(() => {
            executeAction(action, data);
        });
        return;
    }
    // Проверка роли для действий, требующих модератора/админа
    if (action !== 'writeoff' && currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showToast('Недостаточно прав', 'error');
        return;
    }
    executeAction(action, data);
}

// События
function bindEvents() {
    $('#searchInput').oninput = () => { searchQuery = $('#searchInput').value; applyFilterAndRender(); };
    $('#filterType').onchange = () => { filterType = $('#filterType').value; applyFilterAndRender(); };
    $('#filterEquipment').onchange = () => { filterEquipment = $('#filterEquipment').value; applyFilterAndRender(); };
    $$('thead th[data-sort]').forEach(th => th.onclick = () => {
        const key = th.dataset.sort;
        if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        else { sortConfig.key = key; sortConfig.direction = 'asc'; }
        applyFilterAndRender();
    });
   
    $('#btnExportExcel').onclick = () => exportExcel(filteredInventory);
    $('#btnExportCSV').onclick = () => exportCSV(filteredInventory);

    $('#btnAdd').onclick = () => requireAuth('add');
    $('#btnImport').onclick = () => requireAuth('import');
    $('#btnEdit').onclick = () => {
        if (selectedRowCode) requireAuth('edit', selectedRowCode);
    };
    $('#btnDeleteSelected').onclick = () => {
        if (selectedRowCode) requireAuth('delete', selectedRowCode);
    };
    $('#btnDeleteAll').onclick = () => requireAuth('deleteAll');
    $('#btnWriteOff').onclick = () => {
        if (selectedRowCode) window.location.href = `/writeoff.html?code=${encodeURIComponent(selectedRowCode)}`;
    };

    $('#importFileInput').onchange = async (e) => {
        if (!currentUser || (currentUser.role !== 'moderator' && currentUser.role !== 'admin')) {
            showToast('Требуется авторизация', 'error');
            e.target.value = '';
            return;
        }
        if (e.target.files[0]) {
            const success = await handleImport(e.target.files[0]);
            if (success) {
                searchQuery = '';
                filterType = '';
                filterEquipment = '';
                $('#searchInput').value = '';
                $('#filterType').value = '';
                $('#filterEquipment').value = '';
                selectedRowCode = null;
                await loadData();
            }
            e.target.value = '';
        }
    };

    $('#btnSubmit').onclick = submitForm;
    $('#btnCancel').onclick = () => $('#modalOverlay').classList.add('hidden');
    $('#btnConfirmDelete').onclick = executeDelete;
    $('#btnConfirmCancel').onclick = () => $('#confirmOverlay').classList.add('hidden');
    $('#btnConfirmDeleteAll').onclick = executeDeleteAll;
    $('#btnConfirmDeleteAllCancel').onclick = () => $('#confirmDeleteAllOverlay').classList.add('hidden');

    // Удалены обработчики для удалённых кнопок пароля
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            $('#modalOverlay').classList.add('hidden');
            $('#confirmOverlay').classList.add('hidden');
            $('#confirmDeleteAllOverlay').classList.add('hidden');
        }
    });
}

function updateDate() {
    $('#currentDate').textContent = new Date().toLocaleDateString('ru-RU', { weekday:'short', day:'2-digit', month:'long', year:'numeric' });
}

// Инициализация
(async function init() {
    await loadDirectoriesForForm();   // заполняем справочники сразу
    bindEvents();
    await loadData();
    updateDate();
    setInterval(updateDate, 60000);
    updateAuthUI();
})();

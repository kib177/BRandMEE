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

async function resetToDefault() {
    if (!confirm('Сбросить всё?')) return;
    await deleteAllItems();
    const defaults = [ /* можно вставить DEFAULT_DATA или загрузить через CSV */ ];
    if (defaults.length) await saveBulkItems(defaults);
    await loadData();
}

// Модалки
function openAddModal() {
    $('#formMode').value = 'add';
    $('#formOriginalCode').value = '';
    $('#modalTitle').textContent = 'Добавить позицию';
    ['formCode','formName','formModel','formEquipment','formLocation'].forEach(id => $(`#${id}`).value = '');
    $('#formType').value = '';
    $('#formUnit').value = 'ШТ';
    $('#formQty').value = '1,00';
    $('#formDate').value = new Date().toISOString().split('T')[0];
    $('#formCode').readOnly = false;
    $('#modalOverlay').classList.remove('hidden');
}

function openEditModal(code) {
    const item = inventory.find(i => i.code === code);
    if (!item) return;
    $('#formMode').value = 'edit';
    $('#formOriginalCode').value = item.code;
    $('#modalTitle').textContent = 'Редактировать';
    $('#formCode').value = item.code; $('#formCode').readOnly = true;
    $('#formName').value = item.name;
    $('#formModel').value = item.model;
    $('#formType').value = item.type || '';
    $('#formEquipment').value = item.equipment || '';
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
    const item = {
        code: $('#formCode').value.trim(),
        name: $('#formName').value.trim(),
        model: $('#formModel').value.trim(),
        type: $('#formType').value,
        equipment: $('#formEquipment').value.trim(),
        location: $('#formLocation').value.trim(),
        unit: $('#formUnit').value,
        quantity: parseFloat($('#formQty').value.replace(',', '.')),
        date: $('#formDate').value.split('-').reverse().join('.')
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
    $('#btnPasswordSubmit').onclick = submitPassword;
    $('#btnPasswordCancel').onclick = () => $('#passwordOverlay').classList.add('hidden');
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            $('#modalOverlay').classList.add('hidden');
            $('#passwordOverlay').classList.add('hidden');
            $('#confirmOverlay').classList.add('hidden');
            $('#confirmDeleteAllOverlay').classList.add('hidden');
        }
    });
}

function requireAuth(action, data) {
    if (!currentUser) {
        showLoginModal(() => {
            executeAction(action, data);
        });
        return;
    }
    // Проверка роли для модераторских действий
    if (action !== 'writeoff' && currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showToast('Недостаточно прав', 'error');
        return;
    }
    executeAction(action, data);
}

function updateDate() {
    $('#currentDate').textContent = new Date().toLocaleDateString('ru-RU', { weekday:'short', day:'2-digit', month:'long', year:'numeric' });
}

// Инициализация
(async function init() {
    const savedToken = sessionStorage.getItem('token');
    if (savedToken) { token = savedToken; isAuthenticated = true; }
    bindEvents();
    await loadData();
    updateDate();
    setInterval(updateDate, 60000);
    updateAuthUI();
})(); 

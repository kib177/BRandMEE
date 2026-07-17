// app.js – основная логика главной страницы
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
    if (selectedRowCode && !filteredInventory.some(item => item.code === selectedRowCode)) {
        selectedRowCode = null;
    }
    renderTable(filteredInventory);
    updateStats(inventory);
}

function executeAction(action, data) {
    switch (action) {
        case 'add': openAddModal(); break;
        case 'edit': openEditModal(data); break;
        case 'delete': openConfirmDelete(data); break;
        case 'deleteAll': openConfirmDeleteAll(); break;
        case 'import': document.getElementById('importFileInput').click(); break;
    }
}

function requireAuth(action, data) {
    if (!currentUser) {
        showLoginModal(() => executeAction(action, data));
        return;
    }
    if (action !== 'writeoff' && currentUser.role !== 'admin' && currentUser.role !== 'moderator' && currentUser.role !== 'storekeeper') {
        showToast('Недостаточно прав', 'error');
        return;
    }
    executeAction(action, data);
}

function bindEvents() {
    // Поиск
    document.getElementById('searchInput').oninput = () => {
        searchQuery = document.getElementById('searchInput').value;
        applyFilterAndRender();
    };

    // Фильтры
    document.getElementById('filterType').onchange = () => {
        filterTypeValue = document.getElementById('filterType').value;
        applyFilterAndRender();
    };
    document.getElementById('filterEquipment').onchange = () => {
        filterEquipmentValue = document.getElementById('filterEquipment').value;
        applyFilterAndRender();
    };

    // Фильтр по отделу (только для админа)
    const filterDeptEl = document.getElementById('filterDepartment');
    if (filterDeptEl) {
        filterDeptEl.addEventListener('change', () => {
            filterDepartmentValue = filterDeptEl.value;
            applyFilterAndRender();
        });
    }

    // Сброс фильтров
    document.getElementById('btnResetFilters').onclick = () => {
        document.getElementById('searchInput').value = '';
        searchQuery = '';
        filterTypeValue = '';
        filterEquipmentValue = '';
        filterDepartmentValue = '';
        document.getElementById('filterType').value = '';
        document.getElementById('filterEquipment').value = '';
        const filterDept = document.getElementById('filterDepartment');
        if (filterDept) filterDept.value = '';
        selectedRowCode = null;
        applyFilterAndRender();
    };

    // Сортировка
    document.querySelectorAll('thead th[data-sort]').forEach(th => th.onclick = () => {
        const key = th.dataset.sort;
        if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        else { sortConfig.key = key; sortConfig.direction = 'asc'; }
        applyFilterAndRender();
    });

    // Экспорт
    document.getElementById('btnExportExcel').onclick = () => exportExcel(filteredInventory);
    document.getElementById('btnExportCSV').onclick = () => exportCSV(filteredInventory);

    // CRUD
    document.getElementById('btnAdd').onclick = () => requireAuth('add');
    document.getElementById('btnImport').onclick = () => requireAuth('import');
    document.getElementById('btnEdit').onclick = () => {
        if (selectedRowCode) requireAuth('edit', selectedRowCode);
    };
    document.getElementById('btnDeleteSelected').onclick = () => {
        if (selectedRowCode) requireAuth('delete', selectedRowCode);
    };
    document.getElementById('btnDeleteAll').onclick = () => requireAuth('deleteAll');
    document.getElementById('btnWriteOff').onclick = () => {
        if (selectedRowCode) window.location.href = `/writeoff.html?code=${encodeURIComponent(selectedRowCode)}`;
    };

    // Импорт с выбором отдела
    document.getElementById('importFileInput').onchange = async (e) => {
        if (!currentUser || (currentUser.role !== 'moderator' && currentUser.role !== 'admin' && currentUser.role !== 'storekeeper')) {
            showToast('Требуется авторизация', 'error');
            e.target.value = '';
            return;
        }
        if (e.target.files[0]) {
            const file = e.target.files[0];
            const ext = file.name.split('.').pop().toLowerCase();

            // Получаем выбранный отдел (только для админа)
            let departmentId = null;
            if (currentUser.role === 'admin') {
                const deptSelect = document.getElementById('importDepartment');
                departmentId = deptSelect ? deptSelect.value : '';
            }

            try {
                if (ext === 'xlsx' || ext === 'xls') {
                    await loadScript('/js/library/xlsx.full.min.js');
                }

                const formData = new FormData();
                formData.append('file', file);
                if (departmentId) {
                    formData.append('department_id', departmentId);
                }

                const res = await fetch('/api/inventory/import-' + (ext === 'csv' ? 'csv' : 'excel'), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: formData
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Ошибка импорта');
                }

                const result = await res.json();
                showToast(`✅ Импортировано: ${result.count}`, 'success');
                if (result.skippedCount) {
                    showToast(`Пропущено: ${result.skippedCount}`, 'warning');
                }

                // Очищаем фильтры и перезагружаем
                searchQuery = '';
                filterTypeValue = '';
                filterEquipmentValue = '';
                document.getElementById('searchInput').value = '';
                document.getElementById('filterType').value = '';
                document.getElementById('filterEquipment').value = '';
                selectedRowCode = null;
                await loadData();
                await loadDirectoriesForForm();
            } catch (err) {
                showToast(err.message, 'error');
            }
            e.target.value = '';
        }
    };

    document.getElementById('btnSubmit').onclick = submitForm;
    document.getElementById('btnCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('btnCloseView').onclick = () => document.getElementById('viewModalOverlay').classList.add('hidden');
    document.getElementById('btnConfirmDelete').onclick = executeDelete;
    document.getElementById('btnConfirmCancel').onclick = () => document.getElementById('confirmOverlay').classList.add('hidden');
    document.getElementById('btnConfirmDeleteAll').onclick = executeDeleteAll;
    document.getElementById('btnConfirmDeleteAllCancel').onclick = () => document.getElementById('confirmDeleteAllOverlay').classList.add('hidden');

    // Закрытие модалок и сканера по Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.getElementById('modalOverlay').classList.add('hidden');
            document.getElementById('viewModalOverlay').classList.add('hidden');
            document.getElementById('confirmOverlay').classList.add('hidden');
            document.getElementById('confirmDeleteAllOverlay').classList.add('hidden');
            if (typeof stopScanner === 'function') stopScanner();
        }
    });
}

function updateDate() {
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('ru-RU', {
        weekday:'short', day:'2-digit', month:'long', year:'numeric'
    });
}

(async function init() {
    await loadDirectoriesForForm();
    bindEvents();
    if (typeof initScannerButton === 'function') initScannerButton();
    if (typeof initStatsAccordion === 'function') initStatsAccordion();
    await loadData();
    updateDate();
    setInterval(updateDate, 60000);
    updateAuthUI();
})();

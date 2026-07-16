let inventory = [];

async function loadData() {
    const params = {};
    if (filterDepartmentValue) params.department_id = filterDepartmentValue;
    try {
        inventory = await fetchInventory(params);
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

// ========== АВТОРИЗАЦИЯ ДЕЙСТВИЙ ==========
function executeAction(action, data) {
    switch (action) {
        case 'add': openAddModal(); break;
        case 'edit': openEditModal(data); break;
        case 'delete': openConfirmDelete(data); break;
        case 'deleteAll': openConfirmDeleteAll(); break;
        case 'import': $('#importFileInput').click(); break;
    }
}

function requireAuth(action, data) {
    if (!currentUser) {
        showLoginModal(() => executeAction(action, data));
        return;
    }
    if (action !== 'writeoff' && currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showToast('Недостаточно прав', 'error');
        return;
    }
    executeAction(action, data);
}

// ========== ОСНОВНЫЕ СОБЫТИЯ ==========
function bindEvents() {
    // Поиск
    $('#searchInput').oninput = () => { searchQuery = $('#searchInput').value; applyFilterAndRender(); };

    // Фильтры
    $('#filterType').onchange = () => {
        filterTypeValue = $('#filterType').value;
        applyFilterAndRender();
    };
    $('#filterEquipment').onchange = () => {
        filterEquipmentValue = $('#filterEquipment').value;
        applyFilterAndRender();
    };
    

    const filterDeptEl = $('#filterDepartment');
if (filterDeptEl) {
    filterDeptEl.addEventListener('change', function() {
        filterDepartmentValue = this.value;
        applyFilterAndRender();
    });
}

    // Сброс фильтров
    $('#btnResetFilters').onclick = () => {
        $('#searchInput').value = '';
        searchQuery = '';
        filterTypeValue = '';
        filterEquipmentValue = '';
        $('#filterType').value = '';
        $('#filterEquipment').value = '';
        selectedRowCode = null;
        applyFilterAndRender();
        filterDepartmentValue = '';
        const filterDept = document.getElementById('filterDepartment');
        if (filterDept) filterDept.value = '';
    };

    // Сортировка
    $$('thead th[data-sort]').forEach(th => th.onclick = () => {
        const key = th.dataset.sort;
        if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        else { sortConfig.key = key; sortConfig.direction = 'asc'; }
        applyFilterAndRender();
    });

    // Экспорт
    $('#btnExportExcel').onclick = async () => {
       try {
    await loadScript('/js/library/xlsx.full.min.js');
    exportExcel(filteredInventory);
  } catch (e) {
    showToast('Ошибка загрузки Excel', 'error');
  }
};
    $('#btnExportCSV').onclick = () => exportCSV(filteredInventory);

    // CRUD
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

    // Импорт
    $('#importFileInput').onchange = async (e) => {if (e.target.files[0]) {
    const file = e.target.files[0];
    const ext = file.name.split('.').pop().toLowerCase();
    try {
        if (ext === 'xlsx' || ext === 'xls') {
            await loadScript('/js/library/xlsx.full.min.js');
        }
        const success = await handleImport(file);
        if (success) {
            searchQuery = '';
            filterTypeValue = '';
            filterEquipmentValue = '';
            $('#searchInput').value = '';
            $('#filterType').value = '';
            $('#filterEquipment').value = '';
            selectedRowCode = null;
            await loadData();
            await loadDirectoriesForForm();
        }
    } catch (err) {
        showToast('Ошибка загрузки библиотеки', 'error');
    }
    e.target.value = '';
    }
                                                  };

    // Модальные окна
    $('#btnSubmit').onclick = submitForm;
    $('#btnCancel').onclick = () => $('#modalOverlay').classList.add('hidden');
    $('#btnCloseView').onclick = () => $('#viewModalOverlay').classList.add('hidden');
    $('#btnConfirmDelete').onclick = executeDelete;
    $('#btnConfirmCancel').onclick = () => $('#confirmOverlay').classList.add('hidden');
    $('#btnConfirmDeleteAll').onclick = executeDeleteAll;
    $('#btnConfirmDeleteAllCancel').onclick = () => $('#confirmDeleteAllOverlay').classList.add('hidden');

    // Закрытие модалок и сканера по Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            $('#modalOverlay').classList.add('hidden');
            $('#viewModalOverlay').classList.add('hidden');
            $('#confirmOverlay').classList.add('hidden');
            $('#confirmDeleteAllOverlay').classList.add('hidden');
            if (typeof stopScanner === 'function') stopScanner();
        }
    });
}

function updateDate() {
    $('#currentDate').textContent = new Date().toLocaleDateString('ru-RU', {
        weekday:'short', day:'2-digit', month:'long', year:'numeric'
    });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
(async function init() {
    await checkAuth();
    await loadDirectoriesForForm();
    bindEvents();
    if (typeof initScannerButton === 'function') initScannerButton();
    if (typeof initStatsAccordion === 'function') initStatsAccordion();
    await loadData();
    updateDate();
    setInterval(updateDate, 60000);
    updateAuthUI();
})();

/*if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Новый воркер готов, просим обновить страницу
          if (confirm('Доступна новая версия. Обновить?')) {
            window.location.reload();
          }
        }
      });
    });
  });
}*/

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

// ========== МОДАЛЬНЫЕ ОКНА ==========
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
    setVal('formType', item.type_id || '');
    setVal('formEquipment', item.equipment_id || '');
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

// ========== УДАЛЕНИЕ ==========
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
// Проверка, является ли устройство мобильным (имеет сенсорный экран)
function isMobileDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

// Переменная для экземпляра сканера
let html5QrCode = null;

// Запуск сканера камеры
async function startScanner() {
    if (typeof Html5Qrcode === 'undefined') {
    showToast('Сканер временно недоступен', 'error');
    console.error('Библиотека html5-qrcode не загружена');
    return;
}
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;

    readerElement.style.display = 'block';
    if (html5QrCode) {
        await html5QrCode.stop();
        html5QrCode.clear();
    }

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 150 } };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            const code = decodedText.trim();
            $('#searchInput').value = code;

            html5QrCode.stop().then(() => {
                readerElement.style.display = 'none';
                html5QrCode.clear();
                html5QrCode = null;

                const item = inventory.find(i => i.code === code);
                if (item) {
                    window.location.href = `/writeoff.html?code=${encodeURIComponent(code)}`;
                } else {
                    showToast('Товар с таким штрихкодом не найден', 'error');
                    $('#searchInput').value = '';
                    applyFilterAndRender();
                }
            }).catch(err => console.error(err));
        },
        (errorMessage) => {
            // Игнорируем некритичные ошибки сканирования
        }
    ).catch(err => {
        console.error('Не удалось запустить камеру', err);
        showToast('Не удалось запустить камеру. Проверьте разрешения.', 'error');
        readerElement.style.display = 'none';
    });
}

// Инициализация кнопки сканера
function initScannerButton() {
    const btn = document.getElementById('btnScan');
    if (!btn) return;

    if (isMobileDevice()) {
        btn.style.display = 'inline-flex'; // показываем кнопку
        btn.addEventListener('click', () => {
            if (html5QrCode && html5QrCode.isScanning) {
                // Если уже сканирует – останавливаем
                html5QrCode.stop().then(() => {
                    document.getElementById('reader').style.display = 'none';
                    html5QrCode.clear();
                    html5QrCode = null;
                });
            } else {
                startScanner();
            }
        });
    } else {
        btn.style.display = 'none'; // на ПК точно скрываем
    }
}

function bindEvents() {
    $('#searchInput').oninput = () => { searchQuery = $('#searchInput').value; applyFilterAndRender(); };

    $('#filterType').onchange = () => {
        filterTypeValue = $('#filterType').value;
        applyFilterAndRender();
    };
    $('#filterEquipment').onchange = () => {
        filterEquipmentValue = $('#filterEquipment').value;
        applyFilterAndRender();
    };

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
                filterTypeValue = '';
                filterEquipmentValue = '';
                $('#searchInput').value = '';
                $('#filterType').value = '';
                $('#filterEquipment').value = '';
                selectedRowCode = null;
                await loadData();
                await loadDirectoriesForForm(); // обновим справочники после импорта
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

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            $('#modalOverlay').classList.add('hidden');
            $('#confirmOverlay').classList.add('hidden');
            $('#confirmDeleteAllOverlay').classList.add('hidden');
        }
    });
}

function updateDate() {
    $('#currentDate').textContent = new Date().toLocaleDateString('ru-RU', {
        weekday:'short', day:'2-digit', month:'long', year:'numeric'
    });
}

function initStatsAccordion() {
    const accordion = document.getElementById('statsAccordion');
    const header = document.getElementById('statsHeader');
    if (!accordion || !header) return;

    const mediaQuery = window.matchMedia('(max-width: 768px)');

    function updateAccordionState() {
        if (mediaQuery.matches) {
            // На мобильных: по умолчанию свёрнут
            accordion.classList.add('collapsed');
        } else {
            // На десктопе: всегда развёрнут
            accordion.classList.remove('collapsed');
        }
    }

    // Переключение при клике на заголовок (только на мобильных)
    header.addEventListener('click', () => {
        if (mediaQuery.matches) {
            accordion.classList.toggle('collapsed');
        }
    });

    // Отслеживание изменения размера экрана
    mediaQuery.addEventListener('change', updateAccordionState);

    // Начальное состояние
    updateAccordionState();
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
(async function init() {
    await loadDirectoriesForForm();  // эта функция определена в ui.js
    bindEvents();
    initScannerButton();
    await loadData();
    
    updateDate();
    setInterval(updateDate, 60000);
    updateAuthUI();
    initStatsAccordion();
})();

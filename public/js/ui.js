// ui.js – отрисовка таблицы, статистика, работа со справочниками

let selectedRowCode = null;          // код выбранной позиции (или null)
let allTypes = [];                   // кэш всех типов [{id, name}]
let allEquipments = [];              // кэш всего оборудования [{id, name}]

// ========== ЗАГРУЗКА СПРАВОЧНИКОВ И ЗАПОЛНЕНИЕ ФОРМ / ФИЛЬТРОВ ==========
async function loadDirectoriesForForm() {
  try {
    const [typesRes, equipsRes] = await Promise.all([
      fetch('/api/directories/types'),
      fetch('/api/directories/equipment')
    ]);
    allTypes = await typesRes.json();
    allEquipments = await equipsRes.json();

    // Заполняем селект типа в форме добавления/редактирования
    const typeSelect = $('#formType');
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="">— Выберите —</option>' +
        allTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
    // Заполняем селект оборудования в форме добавления/редактирования
    const equipSelect = $('#formEquipment');
    if (equipSelect) {
      equipSelect.innerHTML = '<option value="">— Без оборудования —</option>' +
        allEquipments.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }

    // Обновляем фильтры на главной странице
    const filterType = $('#filterType');
    if (filterType) {
      filterType.innerHTML = '<option value="">🔧 Все типы</option>' +
        allTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      filterType.value = filterTypeValue || '';   // filterTypeValue объявлена в filters.js
    }
    const filterEquip = $('#filterEquipment');
    if (filterEquip) {
      filterEquip.innerHTML = '<option value="">🏭 Всё оборудование</option>' +
        allEquipments.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
      filterEquip.value = filterEquipmentValue || '';
    }
  } catch (err) {
    console.error('Ошибка загрузки справочников:', err);
  }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ОТОБРАЖЕНИЯ ==========
function getTypeName(typeId) {
  const found = allTypes.find(t => t.id == typeId);
  return found ? found.name : '—';
}

function getEquipmentName(equipId) {
  const found = allEquipments.find(e => e.id == equipId);
  return found ? found.name : '—';
}

// ========== ОТРИСОВКА ТАБЛИЦЫ ==========
function renderTable(data) {
    const tbody = $('#tableBody');
    tbody.innerHTML = '';
    if (data.length === 0) {
        $('#emptyState').classList.remove('hidden');
    } else {
        $('#emptyState').classList.add('hidden');
    }
    data.forEach(item => {
        const tr = document.createElement('tr');
        const q = item.quantity;
        let qc = 'normal';
        if (q <= 1) qc = 'critical';
        else if (q <= 2) qc = 'low';
        if (q <= 2) tr.classList.add('low-stock');

        // Используем type_name / equipment_name из JOIN, если есть, иначе подтягиваем из кэша
        const typeName = item.type_name || getTypeName(item.type_id);
        const equipName = item.equipment_name || getEquipmentName(item.equipment_id);

        tr.innerHTML = `
            <td><input type="checkbox" class="row-selector" data-code="${escapeHtml(item.code)}"></td>
            <td class="code-cell">${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.model)}</td>
            <td><span class="type-badge">${escapeHtml(typeName)}</span></td>
            <td class="equip-cell">${escapeHtml(equipName)}</td>
            <td class="location-cell">${escapeHtml(item.location||'—')}</td>
            <td><strong>${escapeHtml(item.unit)}</strong></td>
            <td><span class="qty-badge ${qc}">${formatQty(q)}</span></td>
            <td>${escapeHtml(item.date)}</td>`;
        tbody.appendChild(tr);
    });

    // Обработчики чекбоксов
    $$('.row-selector').forEach(cb => {
        cb.addEventListener('change', function(e) {
            if (this.checked) {
                // Снимаем все остальные чекбоксы
                $$('.row-selector').forEach(other => {
                    if (other !== this) other.checked = false;
                });
                selectedRowCode = this.dataset.code;
            } else {
                selectedRowCode = null;
            }
            updateActionButtons();
        });
    });

    // Если выделенная строка исчезла (после фильтрации), сбрасываем
    if (selectedRowCode && !data.some(item => item.code === selectedRowCode)) {
        selectedRowCode = null;
    }
    updateActionButtons();
}

// ========== КНОПКИ ДЕЙСТВИЙ ==========
function updateActionButtons() {
    const hasSelection = selectedRowCode !== null;
    ['btnEdit', 'btnWriteOff', 'btnDeleteSelected'].forEach(id => {
        const btn = $('#' + id);
        if (btn) {
            btn.disabled = !hasSelection;
            if (hasSelection) {
                btn.classList.remove('disabled');
            } else {
                btn.classList.add('disabled');
            }
        }
    });
}

// ========== СТАТИСТИКА ==========
function updateStats(inventory) {
    const total = inventory.length;
    const totalQty = inventory.reduce((s, i) => s + i.quantity, 0);
    const low = inventory.filter(i => i.quantity <= 2).length;
    let last = '—';
    if (inventory.length) {
        const max = Math.max(...inventory.map(i => parseDate(i.date)));
        const d = new Date(max);
        last = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    $('#statTotal').textContent = total;
    $('#statQty').textContent = formatQty(totalQty);
    $('#statLow').textContent = low;
    $('#statLastDate').textContent = last;
}

// Функция populateFilters больше не используется – оставлена пустой для совместимости,
// чтобы не было ошибок, если где-то ещё вызывается.
function populateFilters(inventory) {
    // Ничего не делаем, т.к. справочники загружаются через loadDirectoriesForForm
}

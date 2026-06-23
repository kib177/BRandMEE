// ui.js – отрисовка таблицы, статистика, наполнение фильтров

let selectedRowCode = null;
let allTypes = [];
let allEquipments = [];

async function loadDirectoriesForForm() {
  try {
    const [typesRes, equipsRes] = await Promise.all([
      fetch('/api/directories/types'),
      fetch('/api/directories/equipment')
    ]);
    allTypes = await typesRes.json();
    allEquipments = await equipsRes.json();

    // Заполняем форму добавления/редактирования
    const typeSelect = $('#formType');
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="">— Выберите —</option>' +
        allTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
    const equipSelect = $('#formEquipment');
    if (equipSelect) {
      equipSelect.innerHTML = '<option value="">— Без оборудования —</option>' +
        allEquipments.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }

    // Заполняем фильтры
    const filterType = $('#filterType');
    if (filterType) {
      filterType.innerHTML = '<option value="">🔧 Все типы</option>' +
        allTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      filterType.value = filterTypeValue || '';
    }
    const filterEquip = $('#filterEquipment');
    if (filterEquip) {
      filterEquip.innerHTML = '<option value="">🏭 Всё оборудование</option>' +
        allEquipments.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
      filterEquip.value = filterEquipmentValue || '';
    }
  } catch (err) {
    console.error('Ошибка загрузки справочников', err);
  }
}

function getTypeName(id) {
  const found = allTypes.find(t => t.id == id);
  return found ? found.name : '—';
}
function getEquipmentName(id) {
  const found = allEquipments.find(e => e.id == id);
  return found ? found.name : '—';
}

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
        tr.innerHTML = `
            <td><input type="checkbox" class="row-selector" data-code="${escapeHtml(item.code)}"></td>
            <td class="code-cell">${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.model)}</td>
            <td><span class="type-badge">${escapeHtml(item.type_name || getTypeName(item.type_id))}</span></td>
            <td class="equip-cell">${escapeHtml(item.equipment_name || getEquipmentName(item.equipment_id))}</td>
            <td class="location-cell">${escapeHtml(item.location||'—')}</td>
            <td><strong>${escapeHtml(item.unit)}</strong></td>
            <td><span class="qty-badge ${qc}">${formatQty(q)}</span></td>
            <td>${escapeHtml(item.date)}</td>`;
        tbody.appendChild(tr);
    });

    $$('.row-selector').forEach(cb => {
        cb.addEventListener('change', function(e) {
            if (this.checked) {
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

    if (selectedRowCode && !data.some(item => item.code === selectedRowCode)) {
        selectedRowCode = null;
    }
    updateActionButtons();
}

// остальные функции (updateActionButtons, updateStats, populateFilters) оставьте без изменений, 
// но populateFilters теперь может не использоваться, если вы полностью перешли на loadDirectoriesForForm.
// Просто удалите вызов populateFilters из applyFilterAndRender (в app.js).

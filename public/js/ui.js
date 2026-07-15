// ui.js – отрисовка таблицы, статистика, работа со справочниками

let selectedRowCode = null;
let allTypes = [];
let allEquipments = [];

// ========== ЗАГРУЗКА СПРАВОЧНИКОВ ==========
async function loadDirectoriesForForm() {
  try {
    const [typesRes, equipsRes] = await Promise.all([
      fetch('/api/directories/types'),
      fetch('/api/directories/equipment')
    ]);

    // Проверка кэша для типов
    if (typesRes.ok && typesRes.headers.get('X-Cache') === 'HIT') {
      showToast('Справочники загружены из кэша', 'warning');
    }

    if (typesRes.ok) {
      const data = await typesRes.json();
      allTypes = Array.isArray(data) ? data : [];
    } else {
      allTypes = [];
    }

    if (equipsRes.ok) {
      const data = await equipsRes.json();
      allEquipments = Array.isArray(data) ? data : [];
    } else {
      allEquipments = [];
    }

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

    // Фильтры на главной странице
    const filterType = $('#filterType');
    if (filterType) {
      const currentVal = filterType.value;
      filterType.innerHTML = '<option value="">🔧 Все типы</option>' +
        allTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      filterType.value = currentVal || '';
    }
    const filterEquip = $('#filterEquipment');
    if (filterEquip) {
      const currentVal = filterEquip.value;
      filterEquip.innerHTML = '<option value="">🏭 Всё оборудование</option>' +
        allEquipments.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
      filterEquip.value = currentVal || '';
    }
  } catch (err) {
    allTypes = [];
    allEquipments = [];
    console.error('Ошибка загрузки справочников:', err);
  }
}

async function loadDepartmentsForFilter() {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) return;
  try {
    const res = await fetch('/api/users/departments', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const depts = await res.json();
    const select = document.getElementById('filterDepartment');
    select.innerHTML = '<option value="">🏢 Все отделы</option>' +
      depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  } catch (e) {
    console.error(e);
  }
}

// В функции bindEvents добавьте:
document.getElementById('filterDepartment').addEventListener('change', function() {
  filterDepartmentValue = this.value;
  applyFilterAndRender();
});
// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function getTypeName(typeId) {
  const found = allTypes.find(t => t.id == typeId);
  return found ? found.name : '—';
}

function getEquipmentName(equipId) {
  const found = allEquipments.find(e => e.id == equipId);
  return found ? found.name : '—';
}

// ========== ТАБЛИЦА ==========
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

        const typeName = item.type_name || getTypeName(item.type_id);
        const equipName = item.equipment_name || getEquipmentName(item.equipment_id);

        tr.innerHTML = `
    <td><input type="checkbox" class="row-selector" data-code="${escapeHtml(item.code)}"></td>
    <td class="code-cell code-link" data-code="${escapeHtml(item.code)}" style="cursor:pointer; text-decoration: underline;">${escapeHtml(item.code)}</td>
    <td>${escapeHtml(item.name)}</td>
    <td>${escapeHtml(item.model)}</td>
    <td><span class="type-badge">${escapeHtml(typeName)}</span></td>
    <td><span class="qty-badge ${qc}">${formatQty(q)}</span></td>
    <td><strong>${escapeHtml(item.unit)}</strong></td>
    <td>${escapeHtml(item.date)}</td>
`;
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

  // Клик по коду позиции открывает карточку
$$('.code-link').forEach(el => {
    el.addEventListener('click', (e) => {
        // Не срабатывать, если кликнули по чекбоксу (он в другой ячейке, но на всякий случай)
        if (e.target.tagName === 'INPUT') return;
        showItemDetails(el.dataset.code);
    });
});
}


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

function updateStats(inventory) {
    const total = inventory.length;
    //const totalQty = inventory.reduce((s, i) => s + i.quantity, 0);
    const low = inventory.filter(i => i.quantity <= 2).length;
    let last = '—';
    if (inventory.length) {
        const max = Math.max(...inventory.map(i => parseDate(i.date)));
        const d = new Date(max);
        last = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // Штучные позиции
    const pcsItems = inventory.filter(i => i.unit === 'ШТ');
    const totalPcs = pcsItems.length;
    const totalPcsQty = pcsItems.reduce((s, i) => s + i.quantity, 0);

    // Метровые позиции
    const mItems = inventory.filter(i => i.unit === 'М');
    const totalM = mItems.length;
    const totalMQty = mItems.reduce((s, i) => s + i.quantity, 0);

    $('#statTotal').textContent = total;
    //$('#statQty').textContent = formatQty(totalQty);
    $('#statLow').textContent = low;
    $('#statLastDate').textContent = last;

    $('#statTotalPcs').textContent = totalPcs;
    $('#statQtyPcs').textContent = formatQty(totalPcsQty);
    $('#statTotalM').textContent = totalM;
    $('#statQtyM').textContent = formatQty(totalMQty);
}

function initStatsAccordion() {
    const accordion = document.getElementById('statsAccordion');
    const header = document.getElementById('statsHeader');
    if (!accordion || !header) return;

    const mediaQuery = window.matchMedia('(max-width: 768px)');

    function updateAccordionState() {
        if (mediaQuery.matches) {
            accordion.classList.add('collapsed');
        } else {
            accordion.classList.remove('collapsed');
        }
    }

    header.addEventListener('click', () => {
        if (mediaQuery.matches) {
            accordion.classList.toggle('collapsed');
        }
    });

    mediaQuery.addEventListener('change', updateAccordionState);
    updateAccordionState();
}

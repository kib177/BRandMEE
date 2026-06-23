// ui.js – отрисовка таблицы, статистика, наполнение фильтров

let selectedRowCode = null;   // код выбранной позиции (или null)

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
            <td><span class="type-badge">${escapeHtml(item.type||'—')}</span></td>
            <td class="equip-cell">${escapeHtml(item.equipment||'—')}</td>
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

function populateFilters(inventory) {
    const types = [...new Set(inventory.map(i => i.type).filter(Boolean))].sort();
    $('#filterType').innerHTML = '<option value="">🔧 Все типы</option>' + 
        types.map(t => `<option value="${t}">${t}</option>`).join('');
    
    const equips = [...new Set(inventory.map(i => i.equipment).filter(Boolean))].sort();
    $('#filterEquipment').innerHTML = '<option value="">🏭 Всё оборудование</option>' + 
        equips.map(e => `<option value="${e}">${e}</option>`).join('');
    
    $('#filterType').value = filterType || '';
    $('#filterEquipment').value = filterEquipment || '';

    $('#formType').innerHTML = '<option value="">— Выберите —</option>' + 
        PART_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
}

async function loadDirectoriesForForm() {
  try {
    const [typesRes, equipsRes] = await Promise.all([
      fetch('/api/directories/types'),
      fetch('/api/directories/equipment')
    ]);
    const types = await typesRes.json();
    const equips = await equipsRes.json();

    // Для формы добавления/редактирования
    const typeSelect = $('#formType');
    typeSelect.innerHTML = '<option value="">— Выберите —</option>' +
      types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    const equipSelect = $('#formEquipment');
    equipSelect.innerHTML = '<option value="">— Без оборудования —</option>' +
      equips.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

    // Для фильтров на главной
    const filterType = $('#filterType');
    filterType.innerHTML = '<option value="">🔧 Все типы</option>' +
      types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    filterType.value = filterTypeValue || '';

    const filterEquip = $('#filterEquipment');
    filterEquip.innerHTML = '<option value="">🏭 Всё оборудование</option>' +
      equips.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    filterEquip.value = filterEquipmentValue || '';
  } catch (err) {
    console.error('Ошибка загрузки справочников', err);
  }
}

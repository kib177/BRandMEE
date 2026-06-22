let sortConfig = { key: null, direction: 'asc' };
let searchQuery = '';
let filterType = '';
let filterEquipment = '';
let filteredInventory = [];

function applyFilters(inventory) {
    let result = [...inventory];
    if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        result = result.filter(item =>
            Object.values(item).some(v => String(v).toLowerCase().includes(q))
        );
    }
    if (filterType) result = result.filter(i => i.type === filterType);
    if (filterEquipment) result = result.filter(i => i.equipment === filterEquipment);

    if (sortConfig.key) {
        const key = sortConfig.key;
        result.sort((a, b) => {
            let va, vb;
            if (key === 'quantity') { va = a.quantity; vb = b.quantity; }
            else if (key === 'date') { va = parseDate(a.date); vb = parseDate(b.date); }
            else { va = String(a[key]||'').toLowerCase(); vb = String(b[key]||'').toLowerCase(); }
            if (va < vb) return sortConfig.direction === 'asc' ? -1 : 1;
            if (va > vb) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    filteredInventory = result;
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
            <td class="code-cell">${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.model)}</td>
            <td><span class="type-badge">${escapeHtml(item.type||'—')}</span></td>
            <td class="equip-cell">${escapeHtml(item.equipment||'—')}</td>
            <td class="location-cell">${escapeHtml(item.location||'—')}</td>
            <td><strong>${escapeHtml(item.unit)}</strong></td>
            <td><span class="qty-badge ${qc}">${formatQty(q)}</span></td>
            <td>${escapeHtml(item.date)}</td>
            <td><div class="actions-cell">
                <button class="btn btn-outline btn-sm btn-edit" data-code="${escapeHtml(item.code)}">✏️</button>
                <button class="btn btn-outline btn-sm btn-writeoff" data-code="${escapeHtml(item.code)}" title="Списать">📤</button>
                <button class="btn btn-danger btn-sm btn-delete" data-code="${escapeHtml(item.code)}">🗑️</button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    $$('.btn-edit').forEach(b => b.onclick = () => requirePassword('edit', b.dataset.code));
    $$('.btn-delete').forEach(b => b.onclick = () => requirePassword('delete', b.dataset.code));
    $$('.btn-writeoff').forEach(b => {
        b.onclick = () => {
            const code = b.dataset.code;
            window.location.href = `/writeoff.html?code=${encodeURIComponent(code)}`;
        };
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

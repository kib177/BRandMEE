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

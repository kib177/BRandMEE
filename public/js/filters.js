// filters.js – состояние фильтров и их применение

let sortConfig = { key: null, direction: 'asc' };
let searchQuery = '';
let filterTypeValue = '';      // теперь храним ID типа
let filterEquipmentValue = ''; // теперь храним ID оборудования
let filterDepartmentValue = '';
let filteredInventory = [];

function applyFilters(inventory) {
    let result = [...inventory];
    if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        result = result.filter(item =>
            Object.values(item).some(v => String(v).toLowerCase().includes(q))
        );
    }
    if (filterTypeValue) result = result.filter(i => i.type_id == filterTypeValue);
    if (filterEquipmentValue) result = result.filter(i => i.equipment_id == filterEquipmentValue);
    if (filterDepartmentValue) result = result.filter(i => i.department_id == filterDepartmentValue);

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

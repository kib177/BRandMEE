// Экспорт в CSV
async function exportToCSV() {
  try {
    const res = await fetch('/api/inventory');
    const items = await res.json();
    if (!items.length) return showToast('Нет данных для экспорта', 'error');

    // Заголовки CSV
    const header = ['Код','Наименование','Модель','Тип','Оборудование','Расположение','Ед.изм.','Количество','Дата'];
    const rows = items.map(item => [
      item.code, item.name, item.model, item.type,
      item.equipment, item.location, item.unit,
      item.quantity, item.date
    ]);

    // Экранирование полей с запятыми и кавычками
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [header, ...rows].map(row => row.map(escapeCSV).join(';')).join('\n');
    // Добавляем BOM для корректного отображения кириллицы в Excel
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, 'warehouse.csv');
    showToast('Экспорт в CSV готов', 'success');
  } catch (err) {
    showToast('Ошибка экспорта CSV', 'error');
  }
}

// Экспорт в Excel (через сервер)
async function exportToExcel() {
  try {
    const res = await fetch('/api/inventory/export-excel');
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    downloadBlob(blob, 'warehouse.xlsx');
    showToast('Экспорт в Excel готов', 'success');
  } catch (err) {
    console.error('Ошибка экспорта Excel:', err);
    showToast(`Ошибка: ${err.message}`, 'error');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// export.js – экспорт данных в Excel и CSV
async function exportExcel(data) {
    // Загружаем библиотеку XLSX, если её ещё нет
    try {
        await loadScript('/js/library/xlsx.full.min.js');
    } catch (e) {
        showToast('Ошибка загрузки библиотеки Excel', 'error');
        return;
    }

    const exportData = data.map(item => ({
        'Код': item.code,
        'Наименование': item.name,
        'Модель': item.model,
        'Тип': item.type,
        'Оборудование': item.equipment,
        'Расположение': item.location,
        'Ед.изм.': item.unit,
        'Количество': item.quantity,
        'Дата': item.date
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Склад');

    XLSX.writeFile(wb, `sklad_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Экспорт в Excel выполнен');
}

function exportCSV(data) {
    const headers = ['Код','Наименование','Модель','Тип','Оборудование','Расположение','Ед.изм.','Количество','Дата'];
    const rows = data.map(i => [
        i.code,
        i.name,
        i.model,
        i.type,
        i.equipment,
        i.location || '',
        i.unit,
        i.quantity.toString().replace('.', ','),
        i.date
    ]);
    const csv = [headers, ...rows]
        .map(r => r.map(c => String(c).includes(';') ? `"${c}"` : c).join(';'))
        .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sklad_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showToast('Экспорт в CSV выполнен');
}

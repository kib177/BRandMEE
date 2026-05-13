function exportCSV(data) {
    const headers = ['Код','Наименование','Модель','Тип','Оборудование','Расположение','Ед.изм.','Количество','Дата'];
    const rows = data.map(i => [i.code,i.name,i.model,i.type,i.equipment,i.location||'',i.unit,i.quantity.toString().replace('.',','),i.date]);
    const csv = [headers, ...rows].map(r => r.map(c => String(c).includes(';') ? `"${c}"` : c).join(';')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sklad_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('Экспорт выполнен');
}

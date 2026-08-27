async function handleImport(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    let result;
    if (ext === 'csv') {
      result = await importCSVFile(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      result = await importExcelFile(file);
    } else {
      throw new Error('Неподдерживаемый формат. Разрешены CSV, XLSX, XLS');
    }

    if (result.skippedCount && result.skippedCount > 0) {
      showToast(`✅ Добавлено: ${result.count}. Пропущено: ${result.skippedCount}`, 'warning');
    } else {
      showToast(`✅ Импортировано записей: ${result.count}`, 'success');
    }
    return true;
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  }
}

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

    if (result.skipped && result.skipped.length > 0) {
      console.warn('Пропущенные строки:', result.skipped);
      const skippedInfo = result.skipped.map(s => `Строка ${s.row || s.line}: ${s.reason}`).join('\n');
      showToast(`✅ Добавлено: ${result.count}. Пропущено:\n${skippedInfo}`, 'warning');
    } else {
      showToast(`✅ Импортировано записей: ${result.count}`, 'success');
    }
    return true;
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  }
}

async function handleImport(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    if (ext === 'csv') {
      return await importCSVFile(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      return await importExcelFile(file);
    } else {
      throw new Error('Неподдерживаемый формат. Разрешены CSV, XLSX, XLS');
    }
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  }
}

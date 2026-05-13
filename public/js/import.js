async function handleImport(file) {
    try {
        const result = await importCSVFile(file);
        showToast(`✅ Импортировано: ${result.count} записей`);
        return true;
    } catch (err) {
        showToast(err.message, 'error');
        return false;
    }
}

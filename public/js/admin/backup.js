// backup.js – управление резервными копиями
(function() {
  if (typeof token === 'undefined' || !token) {
    window.location.href = '/welcome.html';
    return;
  }

  // Скачивание дампа
  document.getElementById('btnDownload').addEventListener('click', async () => {
    const status = document.getElementById('downloadStatus');
    status.textContent = 'Создание дампа...';
    try {
      const res = await fetch('/api/backup/download', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup.sql';
      a.click();
      URL.revokeObjectURL(url);
      status.textContent = 'Дамп скачан';
    } catch (e) {
      status.textContent = 'Ошибка: ' + e.message;
    }
  });

  // Выбор файла для восстановления
  const fileInput = document.getElementById('restoreFile');
  const restoreBtn = document.getElementById('btnRestore');

  fileInput.addEventListener('change', () => {
    restoreBtn.disabled = !fileInput.files[0];
  });

  // Восстановление
  restoreBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (!confirm('Восстановление заменит текущие данные. Продолжить?')) return;

    const status = document.getElementById('restoreStatus');
    status.textContent = 'Восстановление...';
    restoreBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      status.textContent = 'База данных успешно восстановлена';
    } catch (e) {
      status.textContent = 'Ошибка: ' + e.message;
    } finally {
      restoreBtn.disabled = false;
    }
  });
})();

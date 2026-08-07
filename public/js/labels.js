// labels.js – генератор наклеек с поиском
(function() {
  if (typeof token === 'undefined' || !token) {
    window.location.href = '/welcome.html';
    return;
  }

  let allItems = []; // сохраним оригинальный список для фильтрации

  // Загрузка списка позиций
  fetch('/api/labels/items', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.json())
    .then(items => {
      allItems = items;
      renderItems(items);
    })
    .catch(e => {
      document.getElementById('itemList').textContent = 'Ошибка загрузки позиций';
      console.error(e);
    });

  function renderItems(items) {
    const container = document.getElementById('itemList');
    if (items.length === 0) {
      container.innerHTML = '<div class="no-results">Ничего не найдено</div>';
      return;
    }
    container.innerHTML = items.map(i => `<label><input type="checkbox" value="${i.code}"> ${i.code} – ${i.name}</label>`).join('');
  }

  // Поиск с фильтрацией
  document.getElementById('searchItems').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderItems(allItems);
      return;
    }
    const filtered = allItems.filter(i => i.code.toLowerCase().includes(query) || i.name.toLowerCase().includes(query));
    renderItems(filtered);
  });

  // Кнопки работают только с видимыми чекбоксами
  document.getElementById('btnSelectAll').addEventListener('click', () => {
    document.querySelectorAll('#itemList input[type="checkbox"]').forEach(cb => cb.checked = true);
  });

  document.getElementById('btnDeselectAll').addEventListener('click', () => {
    document.querySelectorAll('#itemList input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  document.getElementById('btnGenerate').addEventListener('click', async () => {
    const checked = document.querySelectorAll('#itemList input[type="checkbox"]:checked');
    const codes = Array.from(checked).map(cb => cb.value);
    if (codes.length === 0) {
      if (!confirm('Ни одна позиция не выбрана. Сгенерировать наклейки для ВСЕХ позиций?')) return;
    }

    const status = document.getElementById('status');
    status.textContent = 'Генерация...';

    try {
      const res = await fetch('/api/labels/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ codes: codes.length > 0 ? codes : null })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'labels.xlsx';
      a.click();
      URL.revokeObjectURL(url);

      status.textContent = 'Наклейки сгенерированы';
    } catch (e) {
      status.textContent = 'Ошибка: ' + e.message;
    }
  });
})();

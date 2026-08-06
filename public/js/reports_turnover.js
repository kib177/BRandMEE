// reports_turnover.js – оборотная ведомость
(function() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/welcome.html';
    return;
  }

  let turnoverData = [];

  document.getElementById('btnLoad').addEventListener('click', async () => {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    if (!from || !to) {
      alert('Выберите период');
      return;
    }

    try {
      const res = await fetch(`/api/reports/turnover?from=${from}&to=${to}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка загрузки');
      }
      const data = await res.json();
      turnoverData = data;

      const tbody = document.querySelector('#turnoverTable tbody');
      tbody.innerHTML = data.map(item => {
        const beginning = item.current_stock + item.writeoff - item.restock;
        return `<tr>
          <td>${item.code}</td>
          <td>${item.name}</td>
          <td>${item.unit}</td>
          <td>${beginning}</td>
          <td class="positive">${item.restock}</td>
          <td class="negative">${item.writeoff}</td>
          <td>${item.current_stock}</td>
        </tr>`;
      }).join('');
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btnExport').addEventListener('click', () => {
    if (turnoverData.length === 0) {
      alert('Нет данных');
      return;
    }
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;

    let csv = 'Код;Наименование;Ед.;Остаток на начало;Приход;Расход;Остаток на конец\n';
    turnoverData.forEach(item => {
      const beginning = item.current_stock + item.writeoff - item.restock;
      csv += `${item.code};${item.name};${item.unit};${beginning};${item.restock};${item.writeoff};${item.current_stock}\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oborot_${from}_${to}.csv`;
    a.click();
  });

  // Даты по умолчанию: последний месяц
  const now = new Date();
  document.getElementById('dateTo').valueAsDate = now;
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  document.getElementById('dateFrom').valueAsDate = monthAgo;
})();

// reports_writeoffs.js – расширенный отчёт по списаниям
(function() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/welcome.html';
    return;
  }

  let chartMonthly, chartTopItems, chartEquipment;

  document.getElementById('btnLoad').addEventListener('click', async () => {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    if (!from || !to) {
      alert('Выберите период');
      return;
    }

    try {
      const res = await fetch(`/api/reports/writeoffs-extended?from=${from}&to=${to}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка загрузки');
      }
      const data = await res.json();

      // Месячный график
      const months = data.monthly.map(m => m.month);
      const counts = data.monthly.map(m => parseInt(m.count));
      const qtys = data.monthly.map(m => parseFloat(m.total_qty));

      if (chartMonthly) chartMonthly.destroy();
      chartMonthly = new Chart(document.getElementById('chartMonthly'), {
        type: 'bar',
        data: {
          labels: months,
          datasets: [
            { label: 'Количество заявок', data: counts, yAxisID: 'y' },
            { label: 'Списано единиц', data: qtys, yAxisID: 'y1' }
          ]
        },
        options: {
          responsive: true,
          scales: {
            y: { type: 'linear', position: 'left', title: { display: true, text: 'Заявок' } },
            y1: { type: 'linear', position: 'right', title: { display: true, text: 'Единиц' }, grid: { drawOnChartArea: false } }
          }
        }
      });

      // Топ позиций
      const topLabels = data.topItems.map(i => i.item_name.substring(0, 20));
      const topQtys = data.topItems.map(i => parseFloat(i.total_qty));
      if (chartTopItems) chartTopItems.destroy();
      chartTopItems = new Chart(document.getElementById('chartTopItems'), {
        type: 'bar',
        data: {
          labels: topLabels,
          datasets: [{ label: 'Списано', data: topQtys }]
        },
        options: { indexAxis: 'y', responsive: true }
      });

      // Таблица топ позиций
      const tbodyItems = document.querySelector('#topItemsTable tbody');
      tbodyItems.innerHTML = data.topItems.map(i => `<tr><td>${i.item_code}</td><td>${i.item_name}</td><td>${i.total_qty}</td><td>${i.count}</td></tr>`).join('');

      // График по оборудованию (pie)
      if (data.byEquipment.length > 0) {
        const equipLabels = data.byEquipment.map(e => e.equipment || 'Без оборудования');
        const equipQtys = data.byEquipment.map(e => parseFloat(e.total_qty));
        if (chartEquipment) chartEquipment.destroy();
        chartEquipment = new Chart(document.getElementById('chartEquipment'), {
          type: 'pie',
          data: {
            labels: equipLabels,
            datasets: [{ data: equipQtys }]
          },
          options: { responsive: true }
        });
      }

      // Таблица оборудования
      const tbodyEquip = document.querySelector('#equipmentTable tbody');
      tbodyEquip.innerHTML = data.byEquipment.map(e => `<tr><td>${e.equipment || 'Без оборудования'}</td><td>${e.total_qty}</td><td>${e.count}</td></tr>`).join('');

    } catch (err) {
      alert(err.message);
    }
  });

  // Установить даты по умолчанию (последние 6 месяцев)
  const now = new Date();
  document.getElementById('dateTo').valueAsDate = now;
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  document.getElementById('dateFrom').valueAsDate = sixMonthsAgo;
})();

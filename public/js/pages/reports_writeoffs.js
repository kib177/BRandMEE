// reports_writeoffs.js – расширенный отчёт по списаниям
// reports_writeoffs.js – расширенный отчёт по списаниям (улучшенная версия)
(function() {
    const token = localStorage.getItem('token');
    if (!token) window.location.href = '/welcome.html';

    let currentData = null;
    let charts = {};

    // Инициализация дат
    const now = new Date();
    document.getElementById('dateTo').valueAsDate = now;
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    document.getElementById('dateFrom').valueAsDate = sixMonthsAgo;

    // Загрузка отделов для фильтра
    async function loadDepartments() {
        try {
            const res = await fetch('/api/directories/departments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const depts = await res.json();
            const select = document.getElementById('filterDepartment');
            select.innerHTML = '<option value="">Все отделы</option>' + depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        } catch (e) {}
    }

    // Загрузка данных
    async function loadReport() {
        const from = document.getElementById('dateFrom').value;
        const to = document.getElementById('dateTo').value;
        const departmentId = document.getElementById('filterDepartment').value;
        const status = document.getElementById('filterStatus').value;

        if (!from || !to) return alert('Выберите период');

        try {
            const params = new URLSearchParams({ from, to });
            if (departmentId) params.append('department_id', departmentId);
            if (status) params.append('status', status);

            const res = await fetch(`/api/reports/writeoffs-extended?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Ошибка загрузки отчёта');
            currentData = await res.json();

            renderMetrics(currentData.metrics);
            renderCharts(currentData);
            renderDetails(currentData.details || []);
        } catch (err) {
            alert(err.message);
        }
    }

    function renderMetrics(metrics) {
        document.getElementById('metricTotalCount').textContent = metrics.total_count;
        document.getElementById('metricTotalQty').textContent = metrics.total_qty;
        document.getElementById('metricAvg').textContent = metrics.avg_per_day.toFixed(2);
    }

    function renderCharts(data) {
        // Уничтожаем старые графики
        Object.values(charts).forEach(c => c && c.destroy());
        charts = {};

        // Динамика по дням
        const dailyCtx = document.getElementById('chartDaily').getContext('2d');
        charts.daily = new Chart(dailyCtx, {
            type: 'line',
            data: {
                labels: data.byDay.map(d => d.day),
                datasets: [{
                    label: 'Списано единиц',
                    data: data.byDay.map(d => d.total_qty),
                    borderColor: '#2e86c1',
                    backgroundColor: 'rgba(46,134,193,0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // Месяцы
        const monthlyCtx = document.getElementById('chartMonthly').getContext('2d');
        charts.monthly = new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels: data.monthly.map(m => m.month),
                datasets: [
                    { label: 'Заявок', data: data.monthly.map(m => m.count), yAxisID: 'y' },
                    { label: 'Единиц', data: data.monthly.map(m => m.total_qty), yAxisID: 'y1' }
                ]
            },
            options: { responsive: true, scales: { y: { type: 'linear', position: 'left' }, y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } } } }
        });

        // Топ позиций (горизонтальный)
        const topCtx = document.getElementById('chartTopItems').getContext('2d');
        charts.topItems = new Chart(topCtx, {
            type: 'bar',
            data: {
                labels: data.topItems.map(i => i.item_name.length > 20 ? i.item_name.substring(0,20)+'…' : i.item_name),
                datasets: [{ label: 'Списано', data: data.topItems.map(i => i.total_qty) }]
            },
            options: { indexAxis: 'y', responsive: true }
        });

        // По оборудованию (doughnut)
        const equipCtx = document.getElementById('chartEquipment').getContext('2d');
        charts.equipment = new Chart(equipCtx, {
            type: 'doughnut',
            data: {
                labels: data.byEquipment.map(e => e.equipment || 'Без оборудования'),
                datasets: [{ data: data.byEquipment.map(e => e.total_qty) }]
            },
            options: { responsive: true, cutout: '60%' }
        });

        // По статусам (pie)
        const statusCtx = document.getElementById('chartStatus').getContext('2d');
        charts.status = new Chart(statusCtx, {
            type: 'pie',
            data: {
                labels: data.byStatus.map(s => s.status),
                datasets: [{ data: data.byStatus.map(s => s.count) }]
            },
            options: { responsive: true }
        });
    }

    function renderDetails(rows) {
        const tbody = document.querySelector('#detailsTable tbody');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7">Нет данных за выбранный период</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.id}</td>
                <td>${new Date(r.requested_at).toLocaleDateString('ru')}</td>
                <td>${r.item_code}</td>
                <td>${r.item_name}</td>
                <td>${r.quantity}</td>
                <td>${r.equipment_name || '—'}</td>
                <td>${r.status}</td>
            </tr>
        `).join('');
    }

    loadDepartments();
    loadReport();
})();

// Скрин отчета со страницы в pdf
document.getElementById('btnDownloadPdf').addEventListener('click', async () => {
    const element = document.getElementById('reportContent');
    if (!element) return alert('Контент отчёта не найден');

    // Показать индикатор загрузки
    const btn = document.getElementById('btnDownloadPdf');
    btn.textContent = '⏳ Генерация...';
    btn.disabled = true;

    try {
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowHeight: element.scrollHeight,
            windowWidth: element.scrollWidth
        });

        const imgData = canvas.toDataURL('image/png');
        const {jsPDF} = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const imgWidth = pageWidth - 20;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 10;

        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(`Отчёт_по_списаниям_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
        console.error('Ошибка генерации PDF:', err);
        alert('Не удалось создать PDF: ' + err.message);
    } finally {
        btn.textContent = '📄 Скачать PDF';
        btn.disabled = false;
    }
});
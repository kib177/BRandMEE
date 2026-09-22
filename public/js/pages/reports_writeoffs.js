// reports_writeoffs.js – расширенный отчёт по списаниям
(function () {
    'use strict';

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/welcome.html';
        return;
    }

    let currentData = null;
    let charts = {};

    // Универсальная функция формирования строки YYYY-MM-DD из локального времени
function toLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const now = new Date();
const dateToEl = document.getElementById('dateTo');
const dateFromEl = document.getElementById('dateFrom');
if (dateToEl) dateToEl.value = toLocalDateStr(now);
if (dateFromEl) {
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    dateFromEl.value = toLocalDateStr(sixMonthsAgo);
}

    // Загрузка отделов для фильтра
    async function loadDepartments() {
        const select = document.getElementById('filterDepartment');
        if (!select) return;
        try {
            const res = await fetch('/api/directories/departments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const depts = await res.json();
            select.innerHTML = '<option value="">Все отделы</option>' +
                depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        } catch (e) {
            console.warn('Не удалось загрузить отделы', e);
        }
    }

    // Загрузка данных отчёта
    async function loadReport() {
        const from = document.getElementById('dateFrom')?.value;
        const to = document.getElementById('dateTo')?.value;
        const departmentId = document.getElementById('filterDepartment')?.value || '';
        const status = document.getElementById('filterStatus')?.value || '';

        if (!from || !to) {
            alert('Выберите период');
            return;
        }

        try {
            const params = new URLSearchParams({ from, to });
            if (departmentId) params.append('department_id', departmentId);
            if (status) params.append('status', status);

            const res = await fetch(`/api/reports/writeoffs-extended?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Ошибка загрузки отчёта');
            currentData = await res.json();

            renderMetrics(currentData.metrics || {});
            renderCharts(currentData);
            renderDetails(currentData.details || []);
        } catch (err) {
            console.error('loadReport error:', err);
            alert('Ошибка: ' + err.message);
        }
    }

    function renderMetrics(metrics) {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        set('metricTotalCount', metrics.total_count ?? 0);
        set('metricTotalQty', metrics.total_qty ?? 0);
        set('metricAvg', (metrics.avg_per_day ?? 0).toFixed(2));
    }

    function renderCharts(data) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js не загружен');
            return;
        }
        Object.values(charts).forEach(c => c && c.destroy());
        charts = {};

        const dailyEl = document.getElementById('chartDaily');
        if (dailyEl) {
            charts.daily = new Chart(dailyEl.getContext('2d'), {
                type: 'line',
                data: {
                    labels: (data.byDay || []).map(d => d.day),
                    datasets: [{
                        label: 'Списано единиц',
                        data: (data.byDay || []).map(d => d.total_qty),
                        borderColor: '#2e86c1',
                        backgroundColor: 'rgba(46,134,193,0.1)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const monthlyEl = document.getElementById('chartMonthly');
        if (monthlyEl) {
            charts.monthly = new Chart(monthlyEl.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: (data.monthly || []).map(m => m.month),
                    datasets: [
                        { label: 'Заявок', data: (data.monthly || []).map(m => m.count), yAxisID: 'y' },
                        { label: 'Единиц', data: (data.monthly || []).map(m => m.total_qty), yAxisID: 'y1' }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { type: 'linear', position: 'left' },
                        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
                    }
                }
            });
        }

        const topEl = document.getElementById('chartTopItems');
        if (topEl) {
            charts.topItems = new Chart(topEl.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: (data.topItems || []).map(i =>
                        i.item_name.length > 20 ? i.item_name.substring(0, 20) + '…' : i.item_name
                    ),
                    datasets: [{ label: 'Списано', data: (data.topItems || []).map(i => i.total_qty) }]
                },
                options: { indexAxis: 'y', responsive: true }
            });
        }

        const equipEl = document.getElementById('chartEquipment');
        if (equipEl) {
            charts.equipment = new Chart(equipEl.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: (data.byEquipment || []).map(e => e.equipment || 'Без оборудования'),
                    datasets: [{ data: (data.byEquipment || []).map(e => e.total_qty) }]
                },
                options: { responsive: true, cutout: '60%' }
            });
        }

        const statusEl = document.getElementById('chartStatus');
        if (statusEl) {
            charts.status = new Chart(statusEl.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: (data.byStatus || []).map(s => s.status),
                    datasets: [{ data: (data.byStatus || []).map(s => s.count) }]
                },
                options: { responsive: true }
            });
        }
    }

    function renderDetails(rows) {
        const tbody = document.querySelector('#detailsTable tbody');
        if (!tbody) return;
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

    // Привязка кнопок
    const btnLoad = document.getElementById('btnLoad');
    if (btnLoad) {
        btnLoad.addEventListener('click', loadReport);
    } else {
        console.warn('Кнопка #btnLoad не найдена');
    }

    // Кнопка PDF
    const btnPdf = document.getElementById('btnDownloadPdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', async () => {
            const element = document.getElementById('reportContent');
            if (!element) return alert('Контент отчёта не найден');

            if (typeof html2canvas === 'undefined' || !window.jspdf) {
                alert('Библиотеки PDF не загружены. Обновите страницу.');
                return;
            }

            btnPdf.textContent = '⏳ Генерация...';
            btnPdf.disabled = true;

            try {
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    windowHeight: element.scrollHeight,
                    windowWidth: element.scrollWidth
                });

                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
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
                btnPdf.textContent = '📄 PDF';
                btnPdf.disabled = false;
            }
        });
    }

    // Первичная загрузка
    loadDepartments();
    loadReport();
})();

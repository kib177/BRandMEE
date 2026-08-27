// reports_writeoffs.js – расширенный отчёт по списаниям
(function () {
    // Авторизацию уже проверил auth.js, здесь token доступен глобально

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
                headers: {'Authorization': `Bearer ${token}`}  // ← глобальная переменная
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
                        {label: 'Количество заявок', data: counts, yAxisID: 'y'},
                        {label: 'Списано единиц', data: qtys, yAxisID: 'y1'}
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {type: 'linear', position: 'left', title: {display: true, text: 'Заявок'}},
                        y1: {
                            type: 'linear',
                            position: 'right',
                            title: {display: true, text: 'Единиц'},
                            grid: {drawOnChartArea: false}
                        }
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
                    datasets: [{label: 'Списано', data: topQtys}]
                },
                options: {indexAxis: 'y', responsive: true}
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
                        datasets: [{data: equipQtys}]
                    },
                    options: {responsive: true}
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

// Создание отчета в Excel
document.getElementById('btnDownloadExcel').addEventListener('click', async () => {
    if (typeof XLSX === 'undefined') {
        alert('Библиотека Excel не загрузилась. Обновите страницу.');
        return;
    }
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    if (!from || !to) {
        alert('Выберите период и нажмите «Загрузить»');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        // Детальные записи
        const resDetails = await fetch(`/api/write-offs?from=${from}&to=${to}`, {
            headers: {'Authorization': `Bearer ${token}`}
        });
        if (!resDetails.ok) throw new Error('Ошибка загрузки деталей');
        const details = await resDetails.json();

        // Сводки
        const resSummary = await fetch(`/api/reports/writeoffs-extended?from=${from}&to=${to}`, {
            headers: {'Authorization': `Bearer ${token}`}
        });
        if (!resSummary.ok) throw new Error('Ошибка загрузки сводки');
        const summary = await resSummary.json();

        const wb = XLSX.utils.book_new();

        // 1. Детализация
        const wsDetails = XLSX.utils.json_to_sheet(details.map(r => ({
            'ID': r.id,
            'Дата/время запроса': new Date(r.requested_at).toLocaleString('ru-RU'),
            'Код': r.item_code,
            'Наименование': r.item_name,
            'Артикул': r.model || '',
            'Количество': r.quantity,
            'Ед.': r.unit,
            'Оборудование': r.equipment_name || '',
            'Запросил': r.requested_by,
            'Статус': r.status,
            'Дата решения': r.resolved_at ? new Date(r.resolved_at).toLocaleString('ru-RU') : '',
            'Комментарий': r.comment || ''
        })));
        XLSX.utils.book_append_sheet(wb, wsDetails, 'Детализация');

        // 2. По месяцам
        const wsMonthly = XLSX.utils.json_to_sheet(summary.monthly.map(m => ({
            'Месяц': m.month,
            'Кол-во заявок': m.count,
            'Списано единиц': m.total_qty
        })));
        XLSX.utils.book_append_sheet(wb, wsMonthly, 'По месяцам');

        // 3. Топ позиций
        const wsTop = XLSX.utils.json_to_sheet(summary.topItems.map(i => ({
            'Код': i.item_code,
            'Наименование': i.item_name,
            'Списано единиц': i.total_qty,
            'Кол-во заявок': i.count
        })));
        XLSX.utils.book_append_sheet(wb, wsTop, 'Топ позиций');

        // 4. По оборудованию
        const wsEquip = XLSX.utils.json_to_sheet(summary.byEquipment.map(e => ({
            'Оборудование': e.equipment || 'Без оборудования',
            'Списано единиц': e.total_qty,
            'Кол-во заявок': e.count
        })));
        XLSX.utils.book_append_sheet(wb, wsEquip, 'По оборудованию');

        // 5. По статусам
        const statusCounts = details.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});
        const wsStatus = XLSX.utils.json_to_sheet(Object.entries(statusCounts).map(([status, count]) => ({
            'Статус': status,
            'Кол-во': count
        })));
        XLSX.utils.book_append_sheet(wb, wsStatus, 'По статусам');

        XLSX.writeFile(wb, `Отчёт_по_списаниям_${from}_${to}.xlsx`);
    } catch (err) {
        console.error(err);
        alert('Ошибка: ' + err.message);
    }
});
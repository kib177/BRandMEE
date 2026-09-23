(function () {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/welcome.html'; return; }

    // Загружаем оборудование
    fetch('/api/directories/equipment', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
        .then(r => r.json())
        .then(equips => {
            const sel = document.getElementById('equipment');
            sel.innerHTML = '<option value="">— Не выбрано —</option>' +
                equips.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        })
        .catch(() => {});

    // Отправка формы
    document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('message');
        messageEl.textContent = 'Отправка...';

        const formData = new FormData();
        formData.append('item_name', document.getElementById('itemName').value.trim());
        formData.append('article',   document.getElementById('article').value.trim());
        formData.append('quantity', document.getElementById('quantity').value);
        formData.append('unit', document.getElementById('unit').value);
        formData.append('priority', document.getElementById('priority').value);
        formData.append('planned_date', document.getElementById('plannedDate').value);
        formData.append('equipment_id', document.getElementById('equipment').value);
        formData.append('link', document.getElementById('link').value.trim());
        formData.append('justification', document.getElementById('justification').value.trim());
        const file = document.getElementById('file').files[0];
        if (file) formData.append('file', file);

        try {
            const res = await fetch('/api/purchases', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ошибка');
            messageEl.textContent = '✅ Заявка отправлена. Ей присвоен №' + data.id;
            document.getElementById('purchaseForm').reset();
        } catch (e) {
            messageEl.textContent = '❌ ' + e.message;
        }
    });
})();

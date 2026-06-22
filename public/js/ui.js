function renderTable(data) {
    const tbody = $('#tableBody');
    tbody.innerHTML = '';
    if (data.length === 0) {
        $('#emptyState').classList.remove('hidden');
    } else {
        $('#emptyState').classList.add('hidden');
    }
    data.forEach(item => {
        const tr = document.createElement('tr');
        const q = item.quantity;
        let qc = 'normal';
        if (q <= 1) qc = 'critical';
        else if (q <= 2) qc = 'low';
        if (q <= 2) tr.classList.add('low-stock');
        tr.innerHTML = `
            <td class="code-cell">${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.model)}</td>
            <td><span class="type-badge">${escapeHtml(item.type||'—')}</span></td>
            <td class="equip-cell">${escapeHtml(item.equipment||'—')}</td>
            <td class="location-cell">${escapeHtml(item.location||'—')}</td>
            <td><strong>${escapeHtml(item.unit)}</strong></td>
            <td><span class="qty-badge ${qc}">${formatQty(q)}</span></td>
            <td>${escapeHtml(item.date)}</td>
            <td><div class="actions-cell">
                <button class="btn btn-outline btn-sm btn-edit" data-code="${escapeHtml(item.code)}">✏️</button>
                <button class="btn btn-outline btn-sm btn-writeoff" data-code="${escapeHtml(item.code)}" title="Списать">📤</button>
                <button class="btn btn-danger btn-sm btn-delete" data-code="${escapeHtml(item.code)}">🗑️</button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    $$('.btn-edit').forEach(b => b.onclick = () => requirePassword('edit', b.dataset.code));
    $$('.btn-delete').forEach(b => b.onclick = () => requirePassword('delete', b.dataset.code));
    // Новый обработчик для кнопок списания
    $$('.btn-writeoff').forEach(b => {
        b.onclick = () => {
            const code = b.dataset.code;
            window.location.href = `/writeoff.html?code=${encodeURIComponent(code)}`;
        };
    });
}

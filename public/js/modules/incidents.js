// incidents.js – журнал неисправностей оборудования (отдельная страница)
(function() {
  const token = localStorage.getItem('token');
  if (!token) window.location.href = '/welcome.html';

  let allParts = [];
  let selectedPartsCodes = [];

  function canManage() {
    return currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator' || currentUser.role === 'storekeeper');
  }

   function statusLabel(status) {
                const map = {
                    'open': { text: 'Открыт', color: '#ffcc80' },
                    'in_progress': { text: 'В работе', color: '#90caf9' },
                    'resolved': { text: 'Решён', color: '#c8e6c9' },
                    'closed': { text: 'Закрыт', color: '#e0e0e0' }
               };
          return map[status] || { text: status, color: '#ccc' };
         }

  // Загрузка списка оборудования
  async function loadEquipment() {
    try {
      const res = await fetch('/api/directories/equipment', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Ошибка загрузки оборудования');
      const equips = await res.json();
      const select = document.getElementById('equipmentSelect');
      select.innerHTML = '<option value="">Выберите оборудование</option>' + equips.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

      document.getElementById('equipmentSearch').addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();
        const options = select.querySelectorAll('option');
        options.forEach(opt => {
          if (opt.value === '') return;
          opt.style.display = opt.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
        if (!query) select.value = '';
      });

      select.addEventListener('change', async () => {
    const equipmentId = select.value;
    if (!equipmentId) {
        document.getElementById('incidentList').innerHTML = '<p>Выберите оборудование для просмотра истории.</p>';
        document.getElementById('btnAddIncident').style.display = 'none';
        document.getElementById('selectedEquipment').textContent = '';
        return;
    }
    const equipmentName = select.options[select.selectedIndex].text;
    document.getElementById('incidentEquipmentId').value = equipmentId;
    document.getElementById('incidentEquipmentName').value = equipmentName;
    document.getElementById('btnAddIncident').style.display = canManage() ? 'inline-flex' : 'none';
    document.getElementById('selectedEquipment').textContent = 'Оборудование: ' + equipmentName;
    await loadIncidents(equipmentId);
});
    } catch (e) {
      console.error(e);
      document.getElementById('incidentList').innerHTML = '<p style="color:red;">Ошибка загрузки оборудования</p>';
    }
  }

// Загрузка инцидентов
async function loadIncidents(equipmentId) {
    const container = document.getElementById('incidentList');
    container.innerHTML = 'Загрузка...';
    try {
        const res = await fetch(`/api/incidents?equipment_id=${equipmentId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Ошибка загрузки');
        const incidents = await res.json();

        if (!incidents.length) {
            container.innerHTML = '<p>Нет записей о неисправностях.</p>';
            return;
        }

        let html = '<div class="table-wrapper"><table class="incident-table"><thead><tr><th>Дата</th><th>Заголовок</th><th>Статус</th><th>Запчасти</th><th></th></tr></thead><tbody>';
        incidents.forEach(inc => {
            html += `<tr data-id="${inc.id}">
                <td>${new Date(inc.reported_at).toLocaleDateString('ru')}</td>
                <td>${inc.title}</td>
                <td>${statusLabel(inc.status).text}</td>
                <td>${inc.parts_count}</td>
                <td>`;
            if (canManage()) {
                html += `<button class="btn-icon incident-view-btn" data-id="${inc.id}">👁️</button>
                         <button class="btn-icon incident-edit-btn" data-id="${inc.id}">✏️</button>
                         <button class="btn-icon incident-delete-btn" data-id="${inc.id}">🗑️</button>`;
            } else {
                html += `<button class="btn-icon incident-view-btn" data-id="${inc.id}">👁️</button>`;
            }        
            html += `</td></tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;

        // Клик по строке открывает просмотр
        container.querySelectorAll('tr[data-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const id = row.dataset.id;
                viewIncident(id);
            });
        });

        // Обработчики кнопок
        container.querySelectorAll('.incident-view-btn').forEach(btn => {
            btn.addEventListener('click', () => viewIncident(btn.dataset.id));
        });
        container.querySelectorAll('.incident-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openIncidentForm(equipmentId, btn.dataset.id));
        });
        container.querySelectorAll('.incident-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteIncident(equipmentId, btn.dataset.id));
        });
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Ошибка загрузки.</p>';
    }
}

  // Просмотр инцидента
  async function viewIncident(incidentId) {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();

      const content = document.getElementById('incidentDetailContent');
      let partsHtml = '';
      if (data.parts && data.parts.length) {
        partsHtml = '<ul>';
        data.parts.forEach(p => {
          partsHtml += `<li>${p.inventory_code} – ${p.name} [${p.model || ''}] (${p.quantity} ${p.unit})</li>`;
        });
        partsHtml += '</ul>';
      } else {
        partsHtml = '<p>Запчасти не указаны</p>';
      }

      content.innerHTML = `
        <p><strong>Оборудование:</strong> ${data.equipment_name}</p>
        <p><strong>Заголовок:</strong> ${data.title}</p>
        <p><strong>Статус:</strong> <span class="badge" style="background:${statusLabel(data.status).color}">${statusLabel(data.status).text}</span></p>
        <p><strong>Дата:</strong> ${new Date(data.reported_at).toLocaleString('ru')}</p>
        <p><strong>Описание:</strong><br>${data.description || '—'}</p>
        <p><strong>Причина:</strong><br>${data.root_cause || '—'}</p>
        <p><strong>Решение:</strong><br>${data.solution || '—'}</p>
        <p><strong>Использованные запчасти:</strong></p>
        ${partsHtml}
      `;

      document.getElementById('incidentViewOverlay').classList.remove('hidden');
    } catch (e) {
      alert('Ошибка просмотра: ' + e.message);
    }
  }

  // Открытие формы
  function openIncidentForm(equipmentId, incidentId = null) {
    const form = document.getElementById('incidentForm');
    form.reset();
    document.getElementById('incidentId').value = incidentId || '';
    document.getElementById('incidentEquipmentId').value = equipmentId;
    const equipmentSelect = document.getElementById('equipmentSelect');
    document.getElementById('incidentEquipmentName').value = equipmentSelect.options[equipmentSelect.selectedIndex].text;

    selectedPartsCodes = [];

    if (incidentId) {
      document.getElementById('incidentFormTitle').textContent = 'Редактировать неисправность';
      fetch(`/api/incidents/${incidentId}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          document.getElementById('incidentTitle').value = data.title;
          document.getElementById('incidentDescription').value = data.description || '';
          document.getElementById('incidentRootCause').value = data.root_cause || '';
          document.getElementById('incidentSolution').value = data.solution || '';
          document.getElementById('incidentStatus').value = data.status;
          selectedPartsCodes = data.parts.map(p => p.inventory_code);
          loadPartsForIncident();
        });
    } else {
      document.getElementById('incidentFormTitle').textContent = 'Новая неисправность';
      loadPartsForIncident();
    }
    document.getElementById('incidentFormOverlay').classList.remove('hidden');
  }

  // Загрузка всех запчастей и рендер списка
  async function loadPartsForIncident() {
    try {
      const res = await fetch('/api/inventory', { headers: { 'Authorization': `Bearer ${token}` } });
      allParts = await res.json();
      renderPartsList('');

      const searchInput = document.getElementById('partSearch');
      if (searchInput && !searchInput.dataset.listener) {
        searchInput.addEventListener('input', (e) => renderPartsList(e.target.value));
        searchInput.dataset.listener = 'true';
      }
    } catch (e) {
      console.error('Ошибка загрузки запчастей', e);
    }
  }

  function renderPartsList(query = '') {
    const container = document.getElementById('incidentPartsSelect');
    const filtered = allParts.filter(item =>
      item.code.toLowerCase().includes(query.toLowerCase()) ||
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      (item.model && item.model.toLowerCase().includes(query.toLowerCase()))
    );
    container.innerHTML = filtered.map(item => `
      <label>
        <input type="checkbox" class="incident-part-checkbox" value="${item.code}" ${selectedPartsCodes.includes(item.code) ? 'checked' : ''}>
        ${item.code} – ${item.name} [${item.model || ''}]
      </label>
    `).join('');
    if (!filtered.length) container.innerHTML = '<span style="color:#888;">Ничего не найдено</span>';

    document.querySelectorAll('.incident-part-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (!selectedPartsCodes.includes(cb.value)) selectedPartsCodes.push(cb.value);
        } else {
          selectedPartsCodes = selectedPartsCodes.filter(code => code !== cb.value);
        }
      });
    });
  }

  // Отправка формы
  document.getElementById('incidentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const incidentId = document.getElementById('incidentId').value;
    const equipmentId = document.getElementById('incidentEquipmentId').value;

    const payload = {
      equipment_id: equipmentId,
      title: document.getElementById('incidentTitle').value.trim(),
      description: document.getElementById('incidentDescription').value.trim(),
      root_cause: document.getElementById('incidentRootCause').value.trim(),
      solution: document.getElementById('incidentSolution').value.trim(),
      status: document.getElementById('incidentStatus').value,
      parts: selectedPartsCodes
    };

    try {
      const url = incidentId ? `/api/incidents/${incidentId}` : '/api/incidents';
      const method = incidentId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка сохранения');
      }
      document.getElementById('incidentFormOverlay').classList.add('hidden');
      loadIncidents(equipmentId);
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  });

  // Удаление
  async function deleteIncident(equipmentId, incidentId) {
    if (!confirm('Удалить запись о неисправности?')) return;
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Ошибка удаления');
      loadIncidents(equipmentId);
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  }

  // Кнопки
  document.getElementById('btnAddIncident').addEventListener('click', () => {
    const equipmentId = document.getElementById('incidentEquipmentId').value;
    if (equipmentId) openIncidentForm(equipmentId);
  });
  document.getElementById('btnCancelIncidentForm').addEventListener('click', () => {
    document.getElementById('incidentFormOverlay').classList.add('hidden');
  });
  document.getElementById('btnCloseIncidentView').addEventListener('click', () => {
    document.getElementById('incidentViewOverlay').classList.add('hidden');
  });

  // Инициализация
  loadEquipment();
})();

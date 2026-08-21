// incidents.js – журнал неисправностей оборудования
(function() {
  const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator' || currentUser.role === 'storekeeper');

  // Делегирование кликов по кнопкам истории
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.incident-btn');
    if (btn) {
      const equipmentId = btn.dataset.id;
      const equipmentName = btn.closest('tr').querySelector('.equip-edit').value; // берем имя из input
      openIncidentModal(equipmentId, equipmentName);
    }
  });

  async function openIncidentModal(equipmentId, equipmentName) {
    const overlay = document.getElementById('incidentModalOverlay');
    const content = document.getElementById('incidentContent');
    const title = document.getElementById('incidentModalTitle');
    title.textContent = `История неисправностей: ${equipmentName}`;
    content.innerHTML = 'Загрузка...';
    overlay.classList.remove('hidden');

    // Сохраняем данные в скрытые поля формы
    document.getElementById('incidentEquipmentId').value = equipmentId;
    document.getElementById('incidentEquipmentName').value = equipmentName;

    // Показываем кнопку добавления только при наличии прав
    document.getElementById('btnAddIncident').style.display = canManage ? 'inline-flex' : 'none';

    await loadIncidents(equipmentId);
  }

  async function loadIncidents(equipmentId) {
    const content = document.getElementById('incidentContent');
    try {
      const res = await fetch(`/api/incidents?equipment_id=${equipmentId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Ошибка загрузки');
      const incidents = await res.json();

      if (!incidents.length) {
        content.innerHTML = '<p>Нет записей о неисправностях.</p>';
        return;
      }

      let html = '<div style="max-height: 400px; overflow-y: auto;">';
      html += '<table class="table-users" style="width:100%; font-size:0.85rem;">';
      html += '<thead><tr><th>Дата</th><th>Заголовок</th><th>Статус</th><th>Запчасти</th><th></th></tr></thead><tbody>';
      incidents.forEach(inc => {
        html += `<tr>
          <td>${new Date(inc.reported_at).toLocaleDateString('ru')}</td>
          <td>${inc.title}</td>
          <td>${inc.status}</td>
          <td>${inc.parts_count}</td>
          <td>${canManage ? `<button class="btn-icon incident-edit-btn" data-id="${inc.id}">✏️</button> <button class="btn-icon incident-delete-btn" data-id="${inc.id}">🗑️</button>` : ''}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';

      content.innerHTML = html;

      // Обработчики редактирования и удаления
      document.querySelectorAll('.incident-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openIncidentForm(equipmentId, btn.dataset.id));
      });
      document.querySelectorAll('.incident-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteIncident(equipmentId, btn.dataset.id));
      });
    } catch (e) {
      content.innerHTML = '<p style="color:red;">Ошибка загрузки.</p>';
    }
  }

  // Открыть форму создания
  document.getElementById('btnAddIncident').addEventListener('click', () => {
    openIncidentForm(null);
  });

  function openIncidentForm(incidentId) {
    const formOverlay = document.getElementById('incidentFormOverlay');
    const form = document.getElementById('incidentForm');
    const title = document.getElementById('incidentFormTitle');
    form.reset();
    document.getElementById('incidentId').value = incidentId || '';
    if (incidentId) {
      title.textContent = 'Редактировать неисправность';
      // Загрузка данных для редактирования
      fetch(`/api/incidents/${incidentId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      .then(r => r.json())
      .then(data => {
        document.getElementById('incidentTitle').value = data.title;
        document.getElementById('incidentDescription').value = data.description || '';
        document.getElementById('incidentRootCause').value = data.root_cause || '';
        document.getElementById('incidentSolution').value = data.solution || '';
        document.getElementById('incidentStatus').value = data.status;
        // Заполнение запчастей
        loadPartsForIncident(data.parts);
      });
    } else {
      title.textContent = 'Новая неисправность';
      document.getElementById('incidentTitle').value = '';
      loadPartsForIncident([]);
    }
    formOverlay.classList.remove('hidden');
  }

  async function loadPartsForIncident(selectedParts = []) {
    // Загружаем список всех запчастей для мультиселекта
    try {
      const res = await fetch('/api/inventory', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const items = await res.json();
      const container = document.getElementById('incidentPartsSelect');
      container.innerHTML = items.map(item => `
        <label style="display:block;">
          <input type="checkbox" class="incident-part-checkbox" value="${item.code}" ${selectedParts.some(p => p.inventory_code === item.code) ? 'checked' : ''}>
          ${item.code} – ${item.name}
        </label>
      `).join('');
    } catch (e) {
      console.error('Ошибка загрузки запчастей', e);
    }
  }

  // Отправка формы создания/редактирования
  document.getElementById('incidentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const incidentId = document.getElementById('incidentId').value;
    const equipmentId = document.getElementById('incidentEquipmentId').value;
    const selectedParts = Array.from(document.querySelectorAll('.incident-part-checkbox:checked')).map(cb => cb.value);

    const payload = {
      equipment_id: equipmentId,
      title: document.getElementById('incidentTitle').value.trim(),
      description: document.getElementById('incidentDescription').value.trim(),
      root_cause: document.getElementById('incidentRootCause').value.trim(),
      solution: document.getElementById('incidentSolution').value.trim(),
      status: document.getElementById('incidentStatus').value,
      parts: selectedParts
    };

    try {
      const url = incidentId ? `/api/incidents/${incidentId}` : '/api/incidents';
      const method = incidentId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
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

  // Удаление инцидента
  async function deleteIncident(equipmentId, incidentId) {
    if (!confirm('Удалить запись о неисправности?')) return;
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Ошибка удаления');
      loadIncidents(equipmentId);
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  }

  // Закрытие модалок
  document.getElementById('btnCloseIncidentModal').addEventListener('click', () => {
    document.getElementById('incidentModalOverlay').classList.add('hidden');
  });
  document.getElementById('btnCancelIncidentForm').addEventListener('click', () => {
    document.getElementById('incidentFormOverlay').classList.add('hidden');
  });

})();

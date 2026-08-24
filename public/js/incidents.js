// incidents.js – журнал неисправностей оборудования (отдельная страница)
(function() {
  const token = localStorage.getItem('token');
  if (!token) window.location.href = '/welcome.html';

  // Глобальная функция для проверки роли
  function canManage() {
    return currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator' || currentUser.role === 'storekeeper');
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

      // Фильтрация оборудования при вводе
      document.getElementById('equipmentSearch').addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();
        const options = select.querySelectorAll('option');
        options.forEach(opt => {
          if (opt.value === '') return;
          opt.style.display = opt.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
        if (!query) select.value = ''; // сбрасываем выбор при пустом поиске
      });

      // Обработка выбора
      select.addEventListener('change', async () => {
        const equipmentId = select.value;
        if (!equipmentId) {
          document.getElementById('incidentList').innerHTML = '<p>Выберите оборудование для просмотра истории.</p>';
          document.getElementById('btnAddIncident').style.display = 'none';
          return;
        }
        const equipmentName = select.options[select.selectedIndex].text;
        document.getElementById('incidentEquipmentId').value = equipmentId;
        document.getElementById('incidentEquipmentName').value = equipmentName;
        document.getElementById('btnAddIncident').style.display = canManage() ? 'inline-flex' : 'none';
        await loadIncidents(equipmentId);
      });
    } catch (e) {
      console.error(e);
      document.getElementById('incidentList').innerHTML = '<p style="color:red;">Ошибка загрузки оборудования</p>';
    }
  }

  // Загрузка инцидентов для выбранного оборудования
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

      let html = '<table class="incident-table"><thead><tr><th>Дата</th><th>Заголовок</th><th>Статус</th><th>Запчасти</th>';
      if (canManage()) html += '<th></th>';
      html += '</tr></thead><tbody>';
      incidents.forEach(inc => {
        html += `<tr>
          <td>${new Date(inc.reported_at).toLocaleDateString('ru')}</td>
          <td>${inc.title}</td>
          <td>${inc.status}</td>
          <td>${inc.parts_count}</td>`;
        if (canManage()) {
          html += `<td>
            <button class="btn-icon incident-edit-btn" data-id="${inc.id}">✏️</button>
            <button class="btn-icon incident-delete-btn" data-id="${inc.id}">🗑️</button>
          </td>`;
        }
        html += '</tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;

      // Обработчики редактирования и удаления
      document.querySelectorAll('.incident-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openIncidentForm(equipmentId, btn.dataset.id));
      });
      document.querySelectorAll('.incident-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteIncident(equipmentId, btn.dataset.id));
      });
    } catch (e) {
      container.innerHTML = '<p style="color:red;">Ошибка загрузки.</p>';
    }
  }

  // Открытие формы создания/редактирования
  function openIncidentForm(equipmentId, incidentId = null) {
    const form = document.getElementById('incidentForm');
    form.reset();
    document.getElementById('incidentId').value = incidentId || '';
    document.getElementById('incidentEquipmentId').value = equipmentId;
    const equipmentSelect = document.getElementById('equipmentSelect');
    document.getElementById('incidentEquipmentName').value = equipmentSelect.options[equipmentSelect.selectedIndex].text;

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
          loadPartsForIncident(data.parts);
        });
    } else {
      document.getElementById('incidentFormTitle').textContent = 'Новая неисправность';
      loadPartsForIncident([]);
    }
    document.getElementById('incidentFormOverlay').classList.remove('hidden');
  }

  // Загрузка списка запчастей для выбора
  async function loadPartsForIncident(selectedParts = []) {
    try {
      const res = await fetch('/api/inventory', { headers: { 'Authorization': `Bearer ${token}` } });
      const items = await res.json();
      const container = document.getElementById('incidentPartsSelect');
      container.innerHTML = items.map(item => `
        <label>
          <input type="checkbox" class="incident-part-checkbox" value="${item.code}" ${selectedParts.some(p => p.inventory_code === item.code) ? 'checked' : ''}>
          ${item.code} – ${item.name}
        </label>
      `).join('');
    } catch (e) {
      console.error('Ошибка загрузки запчастей', e);
    }
  }

  // Отправка формы
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

  // Удаление инцидента
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

  // Кнопки управления
  document.getElementById('btnAddIncident').addEventListener('click', () => {
    const equipmentId = document.getElementById('incidentEquipmentId').value;
    if (equipmentId) openIncidentForm(equipmentId);
  });
  document.getElementById('btnCancelIncidentForm').addEventListener('click', () => {
    document.getElementById('incidentFormOverlay').classList.add('hidden');
  });

  // Инициализация
  loadEquipment();
})();

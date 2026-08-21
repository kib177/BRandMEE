const $ = (s) => document.querySelector(s);
const API = '/api/directories';

function authHeaders() {
  return { 'Authorization': `Bearer ${token}` };
}

async function loadTypes() {
  try {
    const res = await fetch(`${API}/types`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Ошибка загрузки типов');
    const types = await res.json();
    const tbody = $('#typesTable tbody');
    tbody.innerHTML = types.map(t => `
      <tr>
        <td>${t.id}</td>
        <td><input type="text" value="${t.name}" data-id="${t.id}" class="type-edit"></td>
        <td>
          <button class="btn btn-sm btn-outline save-type" data-id="${t.id}">💾</button>
          <button class="btn btn-sm btn-danger delete-type" data-id="${t.id}">🗑️</button>
        
        </td>
      </tr>
    `).join('');
  } catch (e) {
    alert('Не удалось загрузить типы');
  }
}

async function loadEquipment() {
  try {
    const res = await fetch(`${API}/equipment`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Ошибка загрузки оборудования');
    const equips = await res.json();
    const tbody = $('#equipTable tbody');
    tbody.innerHTML = equips.map(e => `
      <tr>
        <td>${e.id}</td>
        <td><input type="text" value="${e.name}" data-id="${e.id}" class="equip-edit"></td>
        <td>
          <button class="btn btn-sm btn-outline save-equip" data-id="${e.id}">💾</button>
          <button class="btn btn-sm btn-danger delete-equip" data-id="${e.id}">🗑️</button>
            <button class="btn btn-sm btn-info incident-btn" data-id="${e.id}" title="История неисправностей">🔧</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    alert('Не удалось загрузить оборудование');
  }
}

// Очистка неиспользуемых типов
document.getElementById('cleanupTypes')?.addEventListener('click', async () => {
  if (!confirm('Удалить все типы, которые не привязаны ни к одной запчасти?')) return;
  try {
    const res = await fetch('/api/directories/types/cleanup', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const text = await res.text();
      let message = text;
      try {
        const json = JSON.parse(text);
        message = json.error || text;
      } catch {}
      throw new Error(message);
    }
    loadTypes();
    if (typeof loadDirectoriesForForm === 'function') loadDirectoriesForForm();
    alert('Неиспользуемые типы удалены');
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
});

// Очистка неиспользуемого оборудования
document.getElementById('cleanupEquip')?.addEventListener('click', async () => {
  if (!confirm('Удалить всё оборудование, которое не привязано к запчастям или списаниям?')) return;
  try {
    const res = await fetch('/api/directories/equipment/cleanup', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const text = await res.text();
      let message = text;
      try {
        const json = JSON.parse(text);
        message = json.error || text;
      } catch {}
      throw new Error(message);
    }
    loadEquipment();
    if (typeof loadDirectoriesForForm === 'function') loadDirectoriesForForm();
    alert('Неиспользуемое оборудование удалено');
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
});

// Добавление типа
$('#addType').addEventListener('click', async () => {
  const name = $('#newTypeName').value.trim();
  if (!name) return alert('Введите название типа');
  try {
    const res = await fetch(`${API}/types`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    $('#newTypeName').value = '';
    loadTypes();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
});

// Добавление оборудования
$('#addEquip').addEventListener('click', async () => {
  const name = $('#newEquipName').value.trim();
  if (!name) return alert('Введите название оборудования');
  try {
    const res = await fetch(`${API}/equipment`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    $('#newEquipName').value = '';
    loadEquipment();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
});

// Делегирование событий для сохранения и удаления
document.addEventListener('click', async (e) => {
  const target = e.target;

  if (target.classList.contains('save-type')) {
    const id = target.dataset.id;
    const input = document.querySelector(`input.type-edit[data-id="${id}"]`);
    const name = input.value.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API}/types/${id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      loadTypes();
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  } else if (target.classList.contains('delete-type')) {
    if (!confirm('Удалить тип?')) return;
    const id = target.dataset.id;
    try {
      const res = await fetch(`${API}/types/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      loadTypes();
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  } else if (target.classList.contains('save-equip')) {
    const id = target.dataset.id;
    const input = document.querySelector(`input.equip-edit[data-id="${id}"]`);
    const name = input.value.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API}/equipment/${id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      loadEquipment();
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  } else if (target.classList.contains('delete-equip')) {
    if (!confirm('Удалить оборудование?')) return;
    const id = target.dataset.id;
    try {
      const res = await fetch(`${API}/equipment/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      loadEquipment();
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  }
});

// Аккордеон
document.querySelectorAll('.accordion-header').forEach(header => {
  header.addEventListener('click', () => {
    const accordion = header.closest('.accordion');
    accordion.classList.toggle('collapsed');
  });
});

$('#btnLogout')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/welcome.html';
});

// Запуск загрузок
loadTypes();
loadEquipment();

// admin-users.js – управление пользователями и отделами (без inline-скриптов)
document.addEventListener('DOMContentLoaded', () => {
  if (!token) {
    window.location.href = '/welcome.html';
    return;
  }

  const API_BASE = '/api/users';

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.status === 401) {
      alert('Сессия истекла');
      localStorage.removeItem('token');
      window.location.href = '/welcome.html';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Ошибка');
    }
    return res.json();
  }

  // ========== ПОЛЬЗОВАТЕЛИ ==========
  async function loadUsers() {
    try {
      const users = await apiFetch(API_BASE);
      const tbody = document.querySelector('#usersTable tbody');
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td>${u.username}</td>
          <td>${u.display_name || '—'}</td>
          <td>${u.email || '—'}</td>
          <td>${u.role}</td>
          <td>${u.department_name || '—'}</td>
          <td>
            <button class="btn-icon btn-edit-user" data-id="${u.id}" title="Редактировать">✏️</button>
            <button class="btn-icon btn-delete-user" data-id="${u.id}" title="Удалить">🗑️</button>
          </td>
        </tr>
      `).join('');

      document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.id));
      });
      document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', () => editUser(btn.dataset.id));
      });
    } catch (e) {
      alert('Ошибка загрузки пользователей: ' + e.message);
    }
  }

  async function loadDepartmentsForForm() {
    try {
      const depts = await apiFetch(`${API_BASE}/departments`);
      const select = document.getElementById('department');
      select.innerHTML = '<option value="">— Без отдела —</option>' +
        depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    } catch (e) {
      console.error(e);
    }
  }

  async function editUser(id) {
    try {
      const users = await apiFetch(API_BASE);
      const user = users.find(u => u.id == id);
      if (!user) return;
      document.getElementById('userId').value = user.id;
      document.getElementById('username').value = user.username;
      document.getElementById('displayName').value = user.display_name || '';
      document.getElementById('email').value = user.email || '';
      document.getElementById('password').value = '';
      document.getElementById('role').value = user.role;
      await loadDepartmentsForForm();
      document.getElementById('department').value = user.department_id || '';
      document.getElementById('userModalTitle').textContent = 'Редактировать пользователя';
      document.getElementById('userModalOverlay').classList.remove('hidden');
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteUser(id) {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  }

  document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('userId').value;
    const payload = {
      username: document.getElementById('username').value.trim(),
      display_name: document.getElementById('displayName').value.trim() || null,
      email: document.getElementById('email').value.trim() || null,
      password: document.getElementById('password').value,
      role: document.getElementById('role').value,
      department_id: document.getElementById('department').value || null
    };

    try {
      if (userId) {
        if (!payload.password) delete payload.password;
        await apiFetch(`${API_BASE}/${userId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch(API_BASE, { method: 'POST', body: JSON.stringify(payload) });
      }
      document.getElementById('userModalOverlay').classList.add('hidden');
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('btnAddUser').addEventListener('click', async () => {
    document.getElementById('userId').value = '';
    document.getElementById('userForm').reset();
    document.getElementById('userModalTitle').textContent = 'Добавить пользователя';
    document.getElementById('userModalOverlay').classList.remove('hidden');
    await loadDepartmentsForForm();
  });

  document.getElementById('btnCancelUser').addEventListener('click', () => {
    document.getElementById('userModalOverlay').classList.add('hidden');
  });

  document.getElementById('btnRefreshUsers').addEventListener('click', loadUsers);

  // ========== ОТДЕЛЫ ==========
  async function loadDepartments() {
    try {
      const depts = await apiFetch(`${API_BASE}/departments`);
      const tbody = document.querySelector('#deptsTable tbody');
      tbody.innerHTML = depts.map(d => `
        <tr>
          <td>${d.id}</td>
          <td>${d.name}</td>
          <td>
            <button class="btn-icon btn-rename-dept" data-id="${d.id}" data-name="${d.name}" title="Переименовать">✏️</button>
            <button class="btn-icon btn-delete-dept" data-id="${d.id}" title="Удалить">🗑️</button>
          </td>
        </tr>
      `).join('');

      document.querySelectorAll('.btn-rename-dept').forEach(btn => {
        btn.addEventListener('click', () => renameDept(btn.dataset.id, btn.dataset.name));
      });
      document.querySelectorAll('.btn-delete-dept').forEach(btn => {
        btn.addEventListener('click', () => deleteDept(btn.dataset.id));
      });
    } catch (e) {
      alert('Ошибка загрузки отделов: ' + e.message);
    }
  }

  async function addDept() {
    const name = document.getElementById('newDeptName').value.trim();
    if (!name) return alert('Введите название');
    try {
      await apiFetch(`${API_BASE}/departments`, { method: 'POST', body: JSON.stringify({ name }) });
      document.getElementById('newDeptName').value = '';
      loadDepartments();
      loadDepartmentsForForm();
    } catch (e) {
      alert(e.message);
    }
  }

  async function renameDept(id, oldName) {
    const name = prompt('Новое название:', oldName);
    if (!name || !name.trim()) return;
    try {
      await apiFetch(`${API_BASE}/departments/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      loadDepartments();
      loadDepartmentsForForm();
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteDept(id) {
    if (!confirm('Удалить отдел? Это возможно только если нет связанных пользователей и инвентаря.')) return;
    try {
      await apiFetch(`${API_BASE}/departments/${id}`, { method: 'DELETE' });
      loadDepartments();
      loadDepartmentsForForm();
    } catch (e) {
      alert(e.message);
    }
  }

  document.getElementById('btnAddDept').addEventListener('click', addDept);
  document.getElementById('newDeptName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDept();
    }
  });

  // Первоначальная загрузка
  loadUsers();
  loadDepartments();
});

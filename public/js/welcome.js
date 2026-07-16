// welcome.js – страница входа
document.addEventListener('DOMContentLoaded', () => {
  // Если токен уже есть — сразу на главную
 if (localStorage.getItem('token')) {
  fetch('/api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    .then(r => r.json())
    .then(data => {
      if (data.user) {
        const role = data.user.role;
        if (role === 'admin') window.location.href = '/dashboard_admin.html';
        else if (role === 'moderator') window.location.href = '/dashboard_moderator.html';
        else if (role === 'storekeeper') window.location.href = '/dashboard_storekeeper.html';
        else window.location.href = '/dashboard_user.html';
      }
    });
  return;
}
}

  const form = document.getElementById('loginForm');
  const errorDiv = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) return;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = data.error || 'Ошибка входа';
        return;
      }

      // Сохраняем токен в localStorage и переходим на главную
      localStorage.setItem('token', data.token);   // ← сохраняем в localStorage
      const role = data.user.role;
      if (role === 'admin') {
  window.location.href = '/dashboard_admin.html';
} else if (role === 'moderator') {
  window.location.href = '/dashboard_moderator.html';
} else if (role === 'storekeeper') {
  window.location.href = '/dashboard_storekeeper.html';
} else {
  window.location.href = '/dashboard_user.html';
}
    } catch (err) {
      errorDiv.style.display = 'block';
      errorDiv.textContent = 'Ошибка сети';
    }
  });
});

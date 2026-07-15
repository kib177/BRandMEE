// welcome.js – страница входа
document.addEventListener('DOMContentLoaded', () => {
  // Если токен уже есть — сразу на главную
  if (localStorage.getItem('token')) {            // ← проверяем localStorage
    window.location.href = '/';
    return;
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
      window.location.href = '/';
    } catch (err) {
      errorDiv.style.display = 'block';
      errorDiv.textContent = 'Ошибка сети';
    }
  });
});

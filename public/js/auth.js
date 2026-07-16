// auth.js – управление авторизацией, роли, без таймера бездействия (сессия 5 дней)

let currentUser = null;
let token = localStorage.getItem('token');

// Сразу скрываем элементы, требующие авторизации
(function hideRestrictedElements() {
    document.querySelectorAll('.auth-required, .moderator-only, .admin-only').forEach(el => {
        el.style.display = 'none';
    });
})();

// Функция выхода
function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    updateAuthUI();
    window.location.href = '/welcome.html';
}

// Проверка токена при старте
async function checkAuth() {
  token = localStorage.getItem('token');
  if (!token) {
    // Токена нет совсем – точно разлогинен, можно редиректить
    if (!window.location.pathname.includes('welcome.html')) {
      window.location.href = '/welcome.html';
    }
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      logout();  // logout сам сделает редирект на /welcome.html
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    updateAuthUI();
  } catch (e) {
    logout();
  }
}

// Показ модального окна входа (используется на главной, если требуется)
function showLoginModal(onSuccess) {
    let overlay = document.getElementById('loginOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loginOverlay';
        overlay.className = 'modal-overlay hidden';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 400px; text-align: center;">
                <span style="font-size: 2rem;">🔐</span>
                <h2>Вход в систему</h2>
                <div class="form-group">
                    <input type="text" id="loginUsername" placeholder="Имя пользователя" autocomplete="off">
                </div>
                <div class="form-group">
                    <input type="password" id="loginPassword" placeholder="Пароль">
                </div>
                <div class="form-error" id="loginError" style="display:none;">Неверное имя или пароль</div>
                <div class="form-actions">
                    <button class="btn btn-outline" id="btnLoginCancel">Отмена</button>
                    <button class="btn btn-primary" id="btnLoginSubmit">Войти</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('btnLoginCancel').addEventListener('click', () => {
            overlay.classList.add('hidden');
        });
        document.getElementById('btnLoginSubmit').addEventListener('click', async () => {
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            if (!username || !password) return;
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                if (!res.ok) {
                    document.getElementById('loginError').style.display = 'block';
                    return;
                }
                const data = await res.json();
                token = data.token;
                currentUser = data.user;
                localStorage.setItem('token', token);
                overlay.classList.add('hidden');
                updateAuthUI();
                if (onSuccess) onSuccess();
                window.location.reload();
            } catch (e) {
                document.getElementById('loginError').style.display = 'block';
            }
        });
    }
    overlay.classList.remove('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginUsername').focus();
}

// Обновление интерфейса в зависимости от авторизации и роли
function updateAuthUI() {
    const isLoggedIn = !!currentUser;
    const role = currentUser?.role;

    const adminOnlyElements = document.querySelectorAll('.admin-only');
    const moderatorElements = document.querySelectorAll('.moderator-only');
    const authRequiredElements = document.querySelectorAll('.auth-required');

    authRequiredElements.forEach(el => {
        el.style.display = isLoggedIn ? '' : 'none';
    });

    moderatorElements.forEach(el => {
        el.style.display = (isLoggedIn && (role === 'moderator' || role === 'admin')) ? '' : 'none';
    });

    adminOnlyElements.forEach(el => {
        el.style.display = (isLoggedIn && role === 'admin') ? '' : 'none';
    });

    const authDot = document.getElementById('authDot');
    const authLabel = document.getElementById('authLabel');
    if (isLoggedIn) {
        if (authDot) authDot.classList.remove('locked');
        if (authLabel) authLabel.textContent = `${currentUser.username} (${role})`;
    } else {
        if (authDot) authDot.classList.add('locked');
        if (authLabel) authLabel.textContent = 'Не авторизован';
    }

    let loginBtn = document.getElementById('btnLoginLogout');
    if (!loginBtn) {
        loginBtn = document.createElement('button');
        loginBtn.id = 'btnLoginLogout';
        loginBtn.className = 'btn btn-sm btn-outline';
        loginBtn.style.color = '#1a3c5e';
        loginBtn.style.borderColor = 'rgba(255,255,255,0.7)';
        document.querySelector('.header-inner')?.appendChild(loginBtn);
    }
    if (isLoggedIn) {
        loginBtn.textContent = 'Выйти';
        loginBtn.onclick = logout;
    } else {
        loginBtn.textContent = 'Войти';
        loginBtn.onclick = () => showLoginModal();
    }

    if (typeof updateActionButtons === 'function') {
        updateActionButtons();
    }
}

function getToken() {
    return token;
}

// ===== БУРГЕР-МЕНЮ И ПРОФИЛЬ =====
function injectMenu() {
  if (document.getElementById('menuToggle')) return; // уже есть
  const headerInner = document.querySelector('.header-inner');
  if (!headerInner) return;

  const menuContainer = document.createElement('div');
  menuContainer.className = 'header-menu';
  menuContainer.innerHTML = `
    <button class="btn-icon-menu" id="menuToggle" title="Меню">☰</button>
    <div class="dropdown-menu hidden" id="dropdownMenu">
      <button class="dropdown-item" id="menuProfile">👤 Настройки профиля</button>
    </div>
  `;
  headerInner.appendChild(menuContainer);

  const toggle = document.getElementById('menuToggle');
  const dropdown = document.getElementById('dropdownMenu');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => dropdown.classList.add('hidden'));
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  document.getElementById('menuProfile').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openProfileModal();
  });
}

function openProfileModal() {
  const old = document.getElementById('profileModalOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'profileModalOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 450px;">
      <button class="btn-icon-info" style="position:absolute; top:10px; right:10px; background:none; border:none; font-size:1.2rem; cursor:pointer;" id="closeProfileModal">✕</button>
      <h2>Настройки профиля</h2>
      <form id="profileForm">
        <div class="form-group">
          <label>Текущий пароль *</label>
          <input type="password" id="currentPassword" required autocomplete="off">
        </div>
        <div class="form-group">
          <label>Новый логин (оставьте пустым, чтобы не менять)</label>
          <input type="text" id="newUsername" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Новый пароль (оставьте пустым, чтобы не менять)</label>
          <input type="password" id="newPassword" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="newEmail" value="${currentUser?.email || ''}">
        </div>
        <div class="form-error" id="profileError" style="display:none;"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#closeProfileModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.querySelector('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = overlay.querySelector('#currentPassword').value;
    const newUsername = overlay.querySelector('#newUsername').value.trim();
    const newPassword = overlay.querySelector('#newPassword').value;
    const newEmail = overlay.querySelector('#newEmail').value.trim();

    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername || undefined,
          newPassword: newPassword || undefined,
          newEmail: newEmail || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        overlay.querySelector('#profileError').textContent = data.error || 'Ошибка';
        overlay.querySelector('#profileError').style.display = 'block';
        return;
      }
      if (data.user) {
        currentUser = data.user;
        updateAuthUI();
      }
      overlay.remove();
      showToast?.('Профиль обновлён', 'success') || alert('Профиль обновлён');
    } catch (err) {
      console.error(err);
    }
  });
}

// Внедряем меню после загрузки DOM
document.addEventListener('DOMContentLoaded', injectMenu);

// Запускаем проверку при загрузке
checkAuth();

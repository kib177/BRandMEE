// auth.js – управление авторизацией, роли, таймер бездействия

let currentUser = null;
let token = sessionStorage.getItem('token');
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

// Сразу скрываем элементы, требующие авторизации, инлайново (чтобы избежать конфликта CSS-классов)
(function hideRestrictedElements() {
    document.querySelectorAll('.auth-required, .moderator-only, .admin-only').forEach(el => {
        el.style.display = 'none';
    });
})();

// Функция для выполнения выхода
function logout() {
  token = null;
  currentUser = null;
  sessionStorage.removeItem('token');
  clearTimeout(inactivityTimer);
  updateAuthUI();
  window.location.href = '/welcome.html';
}

// Проверка токена при старте
async function checkAuth() {
  const token = sessionStorage.getItem('token');
  if (!token) {
    // Чтобы не зациклиться на самой странице входа
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
      logout();
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    updateAuthUI();
    resetInactivityTimer();
  } catch (e) {
    logout();
  }
}

// Показ модального окна входа
function showLoginModal(onSuccess) {
    // Создаём оверлей с формой входа, если его нет
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
                const res = await apiFetch('/api/auth/login', {
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
                sessionStorage.setItem('token', token);
                overlay.classList.add('hidden');
                updateAuthUI();
                resetInactivityTimer();
                if (onSuccess) onSuccess();
                showToast(`Добро пожаловать, ${currentUser.username}`, 'success');
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

    // Показываем/скрываем кнопки в тулбаре
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    const moderatorElements = document.querySelectorAll('.moderator-only');
    const authRequiredElements = document.querySelectorAll('.auth-required');

    // Все элементы, требующие авторизации, показываем только если залогинен
    authRequiredElements.forEach(el => {
        el.style.display = isLoggedIn ? '' : 'none';
    });

    // Элементы только для модераторов и админов (оба видят)
    moderatorElements.forEach(el => {
        el.style.display = (isLoggedIn && (role === 'moderator' || role === 'admin')) ? '' : 'none';
    });

    // Элементы только для админов
    adminOnlyElements.forEach(el => {
        el.style.display = (isLoggedIn && role === 'admin') ? '' : 'none';
    });

    // Обновляем блок в шапке
    const authDot = document.getElementById('authDot');
    const authLabel = document.getElementById('authLabel');
    if (isLoggedIn) {
        authDot.classList.remove('locked');
        authLabel.textContent = `${currentUser.username} (${role})`;
    } else {
        authDot.classList.add('locked');
        authLabel.textContent = 'Не авторизован';
    }

    // Кнопка входа/выхода
    let loginBtn = document.getElementById('btnLoginLogout');
    if (!loginBtn) {
        // Создаём кнопку в шапке, если ещё нет
        loginBtn = document.createElement('button');
        loginBtn.id = 'btnLoginLogout';
        loginBtn.className = 'btn btn-sm btn-outline';
        document.querySelector('.header-inner').appendChild(loginBtn);
    }
    if (isLoggedIn) {
        loginBtn.textContent = 'Выйти';
        loginBtn.onclick = logout;
    } else {
        loginBtn.textContent = 'Войти';
        loginBtn.onclick = () => showLoginModal(() => {
            // после входа можно обновить текущие данные, если нужно
        });
    }

    // Обновляем видимость кнопок действий с чекбоксом
    if (typeof updateActionButtons === 'function') {
        updateActionButtons();
    }
}

// Сброс таймера бездействия при активности
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (!currentUser) return;
    inactivityTimer = setTimeout(() => {
        logout();
        showToast('Вы были разлогинены из-за бездействия', 'warning');
    }, INACTIVITY_TIMEOUT);
}

// Вешаем слушателей активности на документ
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer);
});

// При загрузке страницы проверяем токен
checkAuth();

function getToken() {
  return token;
}

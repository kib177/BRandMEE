// auth.js – управление авторизацией, роли, localStorage (сессия 5 дней)

var currentUser = null;   // глобальная переменная
var token = localStorage.getItem('token');   // глобальная переменная

// Сразу скрываем элементы, требующие авторизации
(function hideRestrictedElements() {
    document.querySelectorAll('.auth-required, .moderator-only, .admin-only').forEach(el => {
        el.style.display = 'none';
    });
})();

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    updateAuthUI();
    window.location.href = '/welcome.html';
}

async function checkAuth() {
    if (!token) {
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
    } catch (e) {
        logout();
    }
}

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

function updateAuthUI() {
    const isLoggedIn = !!currentUser;
    const role = currentUser?.role;

    document.querySelectorAll('.auth-required').forEach(el => {
        el.style.display = isLoggedIn ? '' : 'none';
    });

    document.querySelectorAll('.moderator-only').forEach(el => {
        el.style.display = (isLoggedIn && (role === 'moderator' || role === 'admin')) ? '' : 'none';
    });

    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = (isLoggedIn && role === 'admin') ? '' : 'none';
    });

    const authDot = document.getElementById('authDot');
    const authLabel = document.getElementById('authLabel');
    if (authDot && authLabel) {
        if (isLoggedIn) {
            authDot.classList.remove('locked');
            if (authLabel) authLabel.textContent = `${currentUser.display_name || currentUser.username} (${role})`;
        } else {
            authDot.classList.add('locked');
            authLabel.textContent = 'Не авторизован';
        }
    }

    let loginBtn = document.getElementById('btnLoginLogout');
    if (!loginBtn) {
        loginBtn = document.createElement('button');
        loginBtn.id = 'btnLoginLogout';
        loginBtn.className = 'btn btn-sm btn-outline';
        loginBtn.style.color = '#1a3c5e';
        loginBtn.style.borderColor = 'rgba(255,255,255,0.7)';
        const headerInner = document.querySelector('.header-inner');
        if (headerInner) headerInner.appendChild(loginBtn);
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

// Запускаем проверку при загрузке
checkAuth();

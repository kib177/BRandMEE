let isAuthenticated = false;
let token = null;
let pendingAction = null;
let pendingData = null;

function getToken() { return token; }

function updateAuthIndicator() {
    const dot = $('#authDot');
    const label = $('#authLabel');
    if (isAuthenticated) {
        dot.classList.remove('locked');
        label.textContent = 'Авторизован';
    } else {
        dot.classList.add('locked');
        label.textContent = 'Доступ ограничен';
    }
}

function setAuthenticated(t) {
    isAuthenticated = true;
    token = t;
    sessionStorage.setItem('token', t);
    updateAuthIndicator();
}

function requirePassword(action, data = null) {
    if (isAuthenticated) { executeAction(action, data); return; }
    pendingAction = action;
    pendingData = data;
    $('#passwordInput').value = '';
    $('#passwordError').style.display = 'none';
    $('#passwordTitle').textContent = 'Требуется авторизация';
    $('#passwordHint').textContent = 'Введите пароль';
    $('#passwordOverlay').classList.remove('hidden');
}

async function submitPassword() {
    const pw = $('#passwordInput').value;
    try {
        const res = await verifyPassword(pw);
        setAuthenticated(res.token);
        $('#passwordOverlay').classList.add('hidden');
        if (pendingAction) {
            executeAction(pendingAction, pendingData);
            pendingAction = null;
            pendingData = null;
        }
    } catch {
        $('#passwordError').style.display = 'block';
    }
}

function executeAction(action, data) {
    switch (action) {
        case 'add': openAddModal(); break;
        case 'edit': openEditModal(data); break;
        case 'delete': openConfirmDelete(data); break;
        case 'deleteAll': openConfirmDeleteAll(); break;
        case 'import': $('#importFileInput').click(); break;
        case 'reset': resetToDefault(); break;
    }
} 

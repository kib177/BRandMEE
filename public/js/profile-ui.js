// profile-ui.js – бургер-меню и модалка профиля

function injectMenu() {
  if (document.getElementById('menuToggle')) return;
  const headerInner = document.querySelector('.header-inner');
  if (!headerInner) return;

  // Создаём контейнер с кнопкой и меню
  const menuContainer = document.createElement('div');
  menuContainer.className = 'header-menu';
  menuContainer.innerHTML = `
    <button class="btn-icon-menu" id="menuToggle" title="Меню">☰</button>
    <div class="dropdown-menu hidden" id="dropdownMenu">
      <button class="dropdown-item" id="menuProfile">👤 Настройки профиля</button>
      <a href="/admin/users.html" class="dropdown-item admin-only" id="menuUsers" style="display:none;">👥 Пользователи</a>
      <a href="/admin/mailing.html" class="dropdown-item admin-only" id="menuMailing" style="display:none;">📧 Рассылка</a>
      <a href="/labels.html" class="dropdown-item admin-only moderator-only storekeeper-only" id="menuLabels" style="display:none;">🏷️ Наклейки</a>
      <a href="/admin.html" class="dropdown-item admin-only moderator-only" id="menuDirectories" style="display:none;">📚 Справочники</a>
    </div>
  `;
  headerInner.appendChild(menuContainer);

  // Обработчики открытия/закрытия (без изменений)
  const toggle = document.getElementById('menuToggle');
  const dropdown = document.getElementById('dropdownMenu');

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      const btnRect = toggle.getBoundingClientRect();
      const menuWidth = dropdown.offsetWidth || 200;
      const spaceRight = window.innerWidth - btnRect.right;

      if (spaceRight >= menuWidth) {
        dropdown.style.left = btnRect.right + 'px';
        dropdown.style.right = 'auto';
      } else {
        dropdown.style.left = 'auto';
        dropdown.style.right = Math.max(window.innerWidth - btnRect.right, 10) + 'px';
      }
      dropdown.style.top = btnRect.bottom + 4 + 'px';
      dropdown.style.maxWidth = Math.min(menuWidth, window.innerWidth - 20) + 'px';
      dropdown.classList.remove('hidden');
    } else {
      dropdown.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== toggle) {
      dropdown.classList.add('hidden');
    }
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  // Кнопка «Настройки профиля»
  document.getElementById('menuProfile').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openProfileModal();
  });

  // Обновляем видимость пунктов меню при загрузке
  updateMenuVisibility();
}

function openProfileModal() {
  const old = document.getElementById('profileModalOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'profileModalOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 450px; position: relative;">
      <button class="btn-icon-info" id="closeProfileModal" style="position:absolute; top:10px; right:10px;">✕</button>
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
          <input type="email" id="newEmail">
        </div>
        <div class="form-error" id="profileError" style="display:none;"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  // Предзаполняем email из currentUser (если доступен)
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
    overlay.querySelector('#newEmail').value = currentUser.email;
  }

  // Закрытие по крестику или клику вне модалки
  overlay.querySelector('#closeProfileModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Отправка формы
  overlay.querySelector('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = overlay.querySelector('#currentPassword').value;
    const newUsername = overlay.querySelector('#newUsername').value.trim();
    const newPassword = overlay.querySelector('#newPassword').value;
    const newEmail = overlay.querySelector('#newEmail').value.trim();

    const errEl = overlay.querySelector('#profileError');
    errEl.style.display = 'none';

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
        errEl.textContent = data.error || 'Ошибка';
        errEl.style.display = 'block';
        return;
      }
      if (data.user) {
        // обновляем currentUser (глобальная переменная из auth.js)
        if (typeof currentUser !== 'undefined') {
          currentUser.username = data.user.username;
          currentUser.email = data.user.email;
          currentUser.display_name = data.user.display_name;
        }
        if (typeof updateAuthUI === 'function') updateAuthUI();
      }
      overlay.remove();
      alert('Профиль обновлён');
    } catch (err) {
      errEl.textContent = 'Ошибка сети';
      errEl.style.display = 'block';
    }
  });
}

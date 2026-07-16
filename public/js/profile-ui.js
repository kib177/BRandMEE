// profile-ui.js – бургер-меню и модалка профиля

function injectMenu() {
  if (document.getElementById('menuToggle')) return;
  const headerInner = document.querySelector('.header-inner');
  if (!headerInner) return;

  // 1. Создаём контейнер с кнопкой и меню
  const menuContainer = document.createElement('div');
  menuContainer.className = 'header-menu';
  menuContainer.innerHTML = `
    <button class="btn-icon-menu" id="menuToggle" title="Меню">☰</button>
    <div class="dropdown-menu hidden" id="dropdownMenu">
      <button class="dropdown-item" id="menuProfile">👤 Настройки профиля</button>
    </div>
  `;
  headerInner.appendChild(menuContainer);

  // 2. Получаем созданные элементы
  const toggle = document.getElementById('menuToggle');
  const dropdown = document.getElementById('dropdownMenu');

  // 3. Обработчик клика с динамическим позиционированием
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

  // 4. Закрытие по клику вне меню
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== toggle) {
      dropdown.classList.add('hidden');
    }
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  // 5. Кнопка «Настройки профиля»
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

  document.getElementById('closeProfileModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newUsername = document.getElementById('newUsername').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const newEmail = document.getElementById('newEmail').value.trim();

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
        document.getElementById('profileError').textContent = data.error || 'Ошибка';
        document.getElementById('profileError').style.display = 'block';
        return;
      }
      if (data.user) {
        currentUser = data.user;
        if (typeof updateAuthUI === 'function') updateAuthUI();
      }
      overlay.remove();
      if (typeof showToast === 'function') showToast('Профиль обновлён', 'success');
      else alert('Профиль обновлён');
    } catch (err) {
      console.error(err);
    }
  });
}

// Внедряем меню при загрузке страницы
document.addEventListener('DOMContentLoaded', injectMenu);

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

// Функция для показа/скрытия пунктов в зависимости от роли
function updateMenuVisibility() {
  const role = currentUser?.role;
  if (!role) return;

  // Пользователи – только админ
  const usersLink = document.getElementById('menuUsers');
  if (usersLink) usersLink.style.display = (role === 'admin') ? 'block' : 'none';

  // Рассылка – только админ
  const mailingLink = document.getElementById('menuMailing');
  if (mailingLink) mailingLink.style.display = (role === 'admin') ? 'block' : 'none';

  // Наклейки – админ, модератор, кладовщик
  const labelsLink = document.getElementById('menuLabels');
  if (labelsLink) labelsLink.style.display = (role === 'admin' || role === 'moderator' || role === 'storekeeper') ? 'block' : 'none';

  // Справочники – админ, модератор
  const dirLink = document.getElementById('menuDirectories');
  if (dirLink) dirLink.style.display = (role === 'admin' || role === 'moderator') ? 'block' : 'none';
}

// Функция openProfileModal остаётся без изменений (она уже определена у вас)

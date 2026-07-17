const $ = (s) => document.querySelector(s);
const API = '/api/write-offs';
const INVENTORY_API = '/api/inventory';
const DIR_API = '/api/directories';

let currentStock = 0;

// Загрузка справочника оборудования
async function loadEquipmentList() {
  try {
    const res = await fetch(`${DIR_API}/equipment`);
    if (!res.ok) throw new Error('Ошибка загрузки оборудования');
    const equips = await res.json();
    const select = $('#equipment');
    select.innerHTML = '<option value="">— Выберите —</option>' +
      equips.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  } catch (e) {
    console.error('Не удалось загрузить оборудование:', e);
  }
}

// Отображение выбранной позиции (по коду из URL)
async function loadPreselectedItem(code) {
  try {
    const headers = {};
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${INVENTORY_API}/${encodeURIComponent(code)}`, { headers });
    if (!res.ok) throw new Error('Позиция не найдена');
    const item = await res.json();
    $('#selectedItem').value = `${item.code} – ${item.name} (остаток: ${item.quantity} ${item.unit})`;
    $('#selectedCode').value = item.code;
    currentStock = item.quantity;
    $('#quantity').max = currentStock;
    $('#quantity').value = '';
    validateQuantity();
  } catch (e) {
    $('#message').textContent = '❌ Ошибка загрузки позиции: ' + e.message;
  }
}

function validateQuantity() {
  const qtyInput = $('#quantity');
  const submitBtn = $('#submitWriteOff');
  const val = parseFloat(qtyInput.value);
  const msgArea = $('#message');
  if (isNaN(val) || val <= 0) {
    submitBtn.disabled = true;
    msgArea.textContent = '';
    return;
  }
  if (val > currentStock) {
    msgArea.textContent = `❌ Нельзя списать больше, чем есть на складе (${currentStock})`;
    submitBtn.disabled = true;
  } else {
    msgArea.textContent = '';
    submitBtn.disabled = false;
  }
}

$('#quantity').addEventListener('input', validateQuantity);

$('#submitWriteOff').addEventListener('click', async () => {
  const item_code = $('#selectedCode').value;
  const quantity = parseFloat($('#quantity').value);
  const equipment_id = $('#equipment').value;
  const requested_by = (typeof currentUser !== 'undefined' && currentUser && currentUser.username) ? currentUser.username : 'сотрудник';
  const comment = $('#comment').value.trim();

  if (!item_code || !quantity || quantity <= 0) {
    $('#message').textContent = 'Выберите позицию и укажите количество';
    return;
  }
  if (!equipment_id) {
    $('#message').textContent = '❌ Укажите оборудование, на которое выполняется списание';
    return;
  }
  if (quantity > currentStock) {
    $('#message').textContent = `❌ Количество превышает остаток (${currentStock})`;
    return;
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_code, equipment_id, quantity, requested_by, comment })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Ошибка сервера');
    }
    $('#message').textContent = '✅ Заявка отправлена';
    // Очищаем только количество и комментарий, позиция остаётся
    $('#quantity').value = '';
    $('#comment').value = '';
    currentStock = 0; // чтобы не было повторной отправки с тем же количеством без перевыбора
  } catch(e) {
    $('#message').textContent = '❌ ' + e.message;
  }
});

// Автоподстановка позиции из URL
const urlParams = new URLSearchParams(window.location.search);
const preselectedCode = urlParams.get('code');

(async function init() {
  await loadEquipmentList();
  if (preselectedCode) {
    await loadPreselectedItem(preselectedCode);
  } else {
    $('#message').textContent = 'Позиция не указана. Вернитесь на склад и выберите позицию для списания.';
  }

  // Подставляем имя текущего пользователя (если он авторизован)
  if (typeof currentUser !== 'undefined' && currentUser) {
    const requesterField = document.getElementById('requestedBy');
    if (requesterField) {
      requesterField.value = currentUser.display_name || currentUser.username;
      requesterField.readOnly = true;   // чтобы не изменяли
    }
  }
})();

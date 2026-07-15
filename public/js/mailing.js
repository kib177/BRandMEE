// mailing.js – логика страницы рассылки, без inline-скриптов
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/welcome.html';
    return;
  }

  // Загружаем список отделов для выбора
  fetch('/api/mailing/data', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(data => {
      const select = document.getElementById('departmentsSelect');
      if (select) {
        select.innerHTML = data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
      }
    })
    .catch(err => console.error('Ошибка загрузки отделов:', err));

  // Переключение типа получателей
  const recipientRadios = document.querySelectorAll('input[name="recipientType"]');
  const recipientInput = document.getElementById('recipientInput');
  const emailsInput = document.getElementById('emailsInput');
  const deptsSelect = document.getElementById('departmentsSelect');

  recipientRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.value === 'all') {
        recipientInput.style.display = 'none';
      } else if (this.value === 'emails') {
        recipientInput.style.display = 'block';
        emailsInput.style.display = 'block';
        deptsSelect.style.display = 'none';
      } else if (this.value === 'departments') {
        recipientInput.style.display = 'block';
        emailsInput.style.display = 'none';
        deptsSelect.style.display = 'block';
      }
    });
  });

  // Отправка формы
  const form = document.getElementById('mailingForm');
  const statusEl = document.getElementById('statusMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const recipientType = document.querySelector('input[name="recipientType"]:checked').value;
    let recipients = 'all';

    if (recipientType === 'emails') {
      recipients = emailsInput.value.trim();
      if (!recipients) {
        alert('Введите адреса');
        return;
      }
    } else if (recipientType === 'departments') {
      const selected = Array.from(deptsSelect.selectedOptions).map(opt => opt.value);
      if (selected.length === 0) {
        alert('Выберите хотя бы один отдел');
        return;
      }
      recipients = selected.join(',');
    }

    const subject = document.getElementById('subject').value.trim();
    const text = document.getElementById('messageText').value.trim();

    if (!subject || !text) {
      alert('Заполните тему и текст');
      return;
    }

    statusEl.textContent = 'Отправка...';
    statusEl.style.color = '#333';

    try {
      const res = await fetch('/api/mailing/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ recipients, subject, text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      statusEl.textContent = `Отправлено ${data.sent} писем`;
      statusEl.style.color = 'green';
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.style.color = 'red';
    }
  });
});

require('dotenv').config();
const { sendMail } = require('./server/mailer');

sendMail({
  to: process.env.ADMIN_EMAILS?.split(',')[0] || 'твоя@почта.com',
  subject: 'Тестовое письмо',
  html: '<p>Проверка связи</p>'
})
.then(() => console.log('Письмо отправлено'))
.catch(err => console.error('Ошибка:', err));

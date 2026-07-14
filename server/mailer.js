// server/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true для 465
  auth: {
    user: process.env.SMTP_USER,     // ваш email, например warehouse@brandmee.site
    pass: process.env.SMTP_PASS      // пароль приложения (не основной пароль)
  }
});

function sendMail({ to, subject, text, html }) {
  return transporter.sendMail({
    from: `"Склад" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
}

module.exports = { sendMail };

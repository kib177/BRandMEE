const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
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

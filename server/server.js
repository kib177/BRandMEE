/**
 * Warehouse Management System
 * Copyright (c) 2026 Kirill Brigi
 * Licensed under MIT
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { sendMail } = require('./mailer');
const db = require('./db');

const app = express();

// CSP middleware
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' blob:; " +
    "script-src 'self' blob:; " +
    "worker-src 'self' blob:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "connect-src 'self' blob:; " +
    "frame-src 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  next();
});

const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'https://brandmee.site', 
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));

// API маршруты
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/write-offs', require('./routes/writeoffs'));
app.use('/api/directories', require('./routes/directories'));
app.use('/api/users', require('./routes/users'));
app.use('/api/mailing', require('./routes/mailing'));

// Статические файлы (фронтенд)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Для SPA — все остальные запросы на index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'welcome.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Для всех остальных запросов (SPA) отдаём index.html
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на https://brandmee.site`);
});

// Еженедельный отчёт – каждую пятницу в 9:00 по Москве (6:00 UTC)
cron.schedule('0 6 * * 3', async () => {
  console.log('Запуск еженедельной рассылки отчёта');
  try {
    const reportEmails = (process.env.WEEKLY_REPORT_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (reportEmails.length === 0) {
      console.log('Нет адресов для еженедельного отчёта');
      return;
    }

    // Отчёт за последние 7 дней
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const fromDate = weekAgo.toISOString().split('T')[0]; // YYYY-MM-DD

    const rows = db.prepare(`
      SELECT wo.id, wo.item_code, wo.item_name, wo.quantity, wo.unit,
             eq.name AS equipment_name, wo.requested_by, wo.status, wo.requested_at
      FROM write_offs wo
      LEFT JOIN equipment eq ON wo.equipment_id = eq.id
      WHERE wo.requested_at >= ?
      ORDER BY wo.requested_at DESC
    `).all(fromDate);

    if (rows.length === 0) {
      // Можно отправить письмо "нет списаний" или ничего не делать
      return;
    }

    let html = `<h2>Списания за последние 7 дней (с ${fromDate})</h2>`;
    html += '<table border="1" cellpadding="5" style="border-collapse:collapse;">';
    html += '<tr><th>ID</th><th>Код</th><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Оборудование</th><th>Запросил</th><th>Статус</th></tr>';
    for (const r of rows) {
      html += `<tr>
        <td>${r.id}</td>
        <td>${r.item_code}</td>
        <td>${r.item_name}</td>
        <td>${r.quantity}</td>
        <td>${r.unit}</td>
        <td>${r.equipment_name || '—'}</td>
        <td>${r.requested_by}</td>
        <td>${r.status}</td>
      </tr>`;
    }
    html += '</table>';

    await sendMail({
      to: reportEmails.join(','),
      subject: `Еженедельный отчёт по списаниям (${new Date().toLocaleDateString('ru')})`,
      html
    });
    console.log('Еженедельный отчёт отправлен');
  } catch (err) {
    console.error('Ошибка отправки еженедельного отчёта:', err);
  }
}, {
  timezone: 'Europe/Moscow'
});



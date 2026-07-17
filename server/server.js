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
const compression = require('compression');
const app = express();

app.use(compression());

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




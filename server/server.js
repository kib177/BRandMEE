/**
 * Warehouse Management System
 * Copyright (c) 2026 Kirill Brigi
 * Licensed under MIT
 */

require('dotenv').config();
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { sendMail } = require('./mailer');
const db = require('./db');
const express = require('express');
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
app.use('/api/inventory/files', require('./routes/inventory-files'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/write-offs', require('./routes/writeoffs'));
app.use('/api/directories', require('./routes/directories'));
app.use('/api/users', require('./routes/users'));
app.use('/api/mailing', require('./routes/mailing'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/labels', require('./routes/labels'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/incidents', require('./routes/incidents'));

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') res.setHeader('Content-Type', 'image/jpeg');
    else if (ext === '.png') res.setHeader('Content-Type', 'image/png');
    else if (ext === '.webp') res.setHeader('Content-Type', 'image/webp');
  }
}));

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

const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = '/opt/warehouse/backups';

// Еженедельный дамп – каждое воскресенье в 3:00
cron.schedule('0 3 * * 0', async () => {
  console.log('Начало еженедельного резервного копирования');
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, fileName);

    const dbName = process.env.DB_NAME || 'warehouse_db';
    const cmd = `sudo -u postgres pg_dump -d ${dbName} -F p > ${filePath}`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('Ошибка создания дампа:', stderr);
        return;
      }
      console.log(`Дамп сохранён: ${filePath}`);

      // Удаляем дампы старше 14 дней
      fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) return;
        files.forEach(file => {
          const fullPath = path.join(BACKUP_DIR, file);
          fs.stat(fullPath, (statErr, stat) => {
            if (!statErr && Date.now() - stat.mtimeMs > 14 * 24 * 60 * 60 * 1000) {
              fs.unlink(fullPath, () => console.log(`Удалён старый дамп: ${file}`));
            }
          });
        });
      });
    });
  } catch (err) {
    console.error('Ошибка планировщика дампа:', err);
  }
}, {
  timezone: 'Europe/Moscow'
});




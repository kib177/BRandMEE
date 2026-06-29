const express = require('express');
const cors = require('cors');
const path = require('path');
const inventoryRoutes = require('./routes/inventory');

const app = express();

// CSP middleware
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://cdn.sheetjs.com https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-src 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  next();
});

const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self' https://cdn.sheetjs.com https://unpkg.com; ..."
  );
  next();
});

app.use(cors({
  origin: 'https://brandmee.site', 
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));

// API маршруты
app.use('/api/inventory', inventoryRoutes);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/write-offs', require('./routes/writeoffs'));
app.use('/api/directories', require('./routes/directories'));

// Статические файлы (фронтенд)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Для SPA — все остальные запросы на index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});

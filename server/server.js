const express = require('express');
const cors = require('cors');
const path = require('path');
const inventoryRoutes = require('./routes/inventory');

const app = express();

// CSP middleware
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' blob:; " +
    "script-src 'self' https://unpkg.com blob:; " +
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
  origin: 'http://localhost:3000', 
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

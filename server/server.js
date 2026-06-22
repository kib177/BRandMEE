const express = require('express');
const cors = require('cors');
const path = require('path');
const inventoryRoutes = require('./routes/inventory');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// API маршруты
app.use('/api/inventory', inventoryRoutes);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/write-offs', require('./routes/writeoffs'));

// Статические файлы (фронтенд)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Для SPA — все остальные запросы на index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});

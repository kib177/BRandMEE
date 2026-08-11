const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });

// Скачивание дампа
router.get('/download', authMiddleware, requireRole('admin'), async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup_${timestamp}.sql`;
  const filePath = path.join('/tmp', fileName);

  // Получаем параметры подключения из переменных окружения (или используем стандартные)
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || 5432;
  const dbName = process.env.DB_NAME || 'warehouse_db';
  const dbUser = process.env.DB_USER || 'warehouse_admin';
  const dbPassword = process.env.DB_PASSWORD || '';

  const env = { ...process.env, PGPASSWORD: dbPassword };
  const cmd = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F p > ${filePath}`;

  exec(cmd, { env }, (error, stdout, stderr) => {
    if (error) {
      console.error('Ошибка pg_dump:', stderr);
      return res.status(500).json({ error: 'Ошибка создания дампа' });
    }
    res.download(filePath, fileName, (err) => {
      if (err) console.error('Ошибка отправки файла:', err);
      fs.unlink(filePath, () => {}); // удаляем временный файл
    });
  });
});

// Восстановление из дампа
router.post('/restore', authMiddleware, requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const filePath = req.file.path;

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || 5432;
  const dbName = process.env.DB_NAME || 'warehouse_db';
  const dbUser = process.env.DB_USER || 'warehouse_admin';
  const dbPassword = process.env.DB_PASSWORD || '';

  const env = { ...process.env, PGPASSWORD: dbPassword };
  // Восстановление из SQL-дампа (plain text)
  const cmd = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f ${filePath}`;

  exec(cmd, { env }, (error, stdout, stderr) => {
    fs.unlink(filePath, () => {});
    if (error) {
      console.error('Ошибка восстановления:', stderr);
      return res.status(500).json({ error: 'Ошибка восстановления базы данных' });
    }
    res.json({ ok: true, message: 'База данных успешно восстановлена' });
  });
});

module.exports = router;

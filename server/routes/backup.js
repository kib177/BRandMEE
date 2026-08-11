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

  const dbName = process.env.DB_NAME || 'warehouse_db';

  // Запускаем pg_dump от имени postgres (суперпользователь), чтобы избежать проблем с правами
  const cmd = `sudo -u postgres pg_dump -d ${dbName} -F p > ${filePath}`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('Ошибка pg_dump:', stderr);
      // Запасной вариант: ручной дамп через Node.js
      generateManualDump().then(dump => {
        fs.writeFileSync(filePath, dump);
        res.download(filePath, fileName, (err) => {
          if (err) console.error('Ошибка отправки:', err);
          fs.unlink(filePath, () => {});
        });
      }).catch(err => {
        res.status(500).json({ error: 'Ошибка создания дампа: ' + err.message });
      });
      return;
    }
    res.download(filePath, fileName, (err) => {
      if (err) console.error('Ошибка отправки:', err);
      fs.unlink(filePath, () => {});
    });
  });
});

// Восстановление из дампа
router.post('/restore', authMiddleware, requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const filePath = req.file.path;
  const dbName = process.env.DB_NAME || 'warehouse_db';

  // Используем sudo, чтобы выполнить psql от имени postgres (суперпользователь)
  const cmd = `sudo -u postgres psql -d ${dbName} -f ${filePath}`;

  exec(cmd, (error, stdout, stderr) => {
    // Удаляем временный файл
    fs.unlink(filePath, () => {});
    if (error) {
      console.error('Ошибка восстановления:', stderr);
      return res.status(500).json({ error: 'Ошибка восстановления: ' + stderr });
    }
    res.json({ ok: true, message: 'База данных успешно восстановлена' });
  });
});

module.exports = router;

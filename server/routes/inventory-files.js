const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Настройка хранилища
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Логирование всех запросов
router.use((req, res, next) => {
  console.log('[INVENTORY-FILES]', req.method, req.path);
  next();
});

// Загрузка файлов
router.post('/:code', authMiddleware, (req, res, next) => {
  upload.array('files', 5)(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Файл слишком большой. Максимальный размер 20 МБ' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { code } = req.params;
    console.log('Загрузка файлов для кода:', code, 'Файлов:', req.files?.length);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файлы не выбраны' });
    }

    const itemRes = await pool.query('SELECT department_id FROM inventory WHERE code = $1 LIMIT 1', [code]);
    if (itemRes.rows.length === 0) {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    const departmentId = itemRes.rows[0].department_id;
    const results = [];

    for (const file of req.files) {
      const result = await pool.query(
        `INSERT INTO inventory_files (inventory_code, department_id, filename, original_name, mime_type, size)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [code, departmentId, file.filename, file.originalname, file.mimetype, file.size]
      );
      results.push({ id: result.rows[0].id, filename: file.filename });
    }

    console.log('Файлы успешно загружены:', results);
    res.json({ ok: true, files: results });
  } catch (err) {
    console.error('Ошибка загрузки файлов:', err);
    res.status(500).json({ error: 'Ошибка загрузки файлов' });
  }
});

// Получение списка файлов
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const files = await pool.query(
      `SELECT id, filename, original_name, mime_type, size, created_at 
       FROM inventory_files WHERE inventory_code = $1 ORDER BY created_at DESC`,
      [code]
    );
    res.json(files.rows);
  } catch (err) {
    console.error('Ошибка получения файлов:', err);
    res.status(500).json({ error: 'Ошибка получения файлов' });
  }
});

// Удаление файла
router.delete('/:code/:fileId', authMiddleware, async (req, res) => {
  try {
    const { code, fileId } = req.params;
    console.log('DELETE file:', code, fileId);

    const fileRes = await pool.query('SELECT * FROM inventory_files WHERE id = $1 AND inventory_code = $2', [fileId, code]);
    if (fileRes.rows.length === 0) {
      console.log('Файл не найден в БД');
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const filePath = path.join(__dirname, '..', 'public', 'uploads', fileRes.rows[0].filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Файл удалён с диска:', filePath);
    } else {
      console.log('Файл на диске не найден:', filePath);
    }

    await pool.query('DELETE FROM inventory_files WHERE id = $1', [fileId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка удаления файла:', err);
    res.status(500).json({ error: 'Ошибка удаления файла' });
  }
});

// Обработчик ошибок multer (например, файл слишком большой)
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл слишком большой. Максимальный размер 5 МБ' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  console.error('Необработанная ошибка в роуте инвентаря:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

module.exports = router;

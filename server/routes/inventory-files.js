const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Настройка временного хранилища (файл сначала сохраняется, потом обрабатывается)
const upload = multer({
  dest: path.join(__dirname, '..', 'public', 'uploads', 'temp'),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 МБ
});

// Готовим папки
const tempDir = path.join(__dirname, '..', 'public', 'uploads', 'temp');
const finalDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(finalDir, { recursive: true });

// Логирование
router.use((req, res, next) => {
  console.log('[INVENTORY-FILES]', req.method, req.path);
  next();
});

// Загрузка файлов
router.post('/:code', authMiddleware, upload.array('files', 5), async (req, res) => {
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
      const originalExt = path.extname(file.originalname).toLowerCase();
      let finalFilename;
      let mimeType = file.mimetype;
      let fileSize = file.size;
      const finalPath = path.join(finalDir, file.filename + '.jpg'); // всегда jpg после сжатия

      // Сжимаем изображения, остальные файлы просто перемещаем
      if (file.mimetype.startsWith('image/')) {
        try {
          await sharp(file.path)
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(finalPath);
          
          fileSize = fs.statSync(finalPath).size;
          mimeType = 'image/jpeg';
          finalFilename = file.filename + '.jpg';
          fs.unlinkSync(file.path); // удаляем временный файл
        } catch (err) {
          console.error('Ошибка сжатия файла:', err);
          // Если сжатие не удалось, просто перемещаем оригинал
          fs.renameSync(file.path, path.join(finalDir, file.filename));
          finalFilename = file.filename;
          // используем оригинальные mimeType и size
        }
      } else {
        // Для не-изображений просто перемещаем
        fs.renameSync(file.path, path.join(finalDir, file.filename));
        finalFilename = file.filename;
      }

      const result = await pool.query(
        `INSERT INTO inventory_files (inventory_code, department_id, filename, original_name, mime_type, size)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [code, departmentId, finalFilename, file.originalname, mimeType, fileSize]
      );
      results.push({ id: result.rows[0].id, filename: finalFilename });
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
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const filePath = path.join(finalDir, fileRes.rows[0].filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM inventory_files WHERE id = $1', [fileId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка удаления файла:', err);
    res.status(500).json({ error: 'Ошибка удаления файла' });
  }
});

module.exports = router;

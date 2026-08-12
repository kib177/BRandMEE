const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

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

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.use((req, res, next) => {
  console.log('[INVENTORY-FILES]', req.method, req.path);
  next();
});

router.post('/:code', authMiddleware, requireRole('admin', 'moderator', 'storekeeper'), upload.array('files', 5), async (req, res) => {
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
      let finalFilename = file.filename;
      let mimeType = file.mimetype;
      let fileSize = file.size;

      if (file.mimetype.startsWith('image/')) {
        const compressedFilename = file.filename + '.jpg';
        const compressedPath = path.join(path.dirname(file.path), compressedFilename);

        try {
          // Добавляем rotate() для автоматического исправления ориентации по EXIF
          await sharp(file.path)
            .rotate()   // <-- исправляет поворот из EXIF
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(compressedPath);

          fs.chmodSync(compressedPath, 0o644);
          fs.unlinkSync(file.path);

          finalFilename = compressedFilename;
          mimeType = 'image/jpeg';
          fileSize = fs.statSync(compressedPath).size;
        } catch (err) {
          console.error('Ошибка сжатия, оставляем оригинал:', err);
        }
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

router.delete('/:code/:fileId', authMiddleware, requireRole('admin', 'moderator', 'storekeeper'), async (req, res) => {
  try {
    const { code, fileId } = req.params;
    const fileRes = await pool.query('SELECT * FROM inventory_files WHERE id = $1 AND inventory_code = $2', [fileId, code]);
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const filePath = path.join(__dirname, '..', 'public', 'uploads', fileRes.rows[0].filename);
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

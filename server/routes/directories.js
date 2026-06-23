const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Все действия разрешены модератору и админу
router.use(authMiddleware);
router.use(requireRole('admin', 'moderator'));

// ========== ТИПЫ ==========
router.get('/types', (req, res) => {
  try {
    const types = db.prepare('SELECT * FROM part_types ORDER BY name').all();
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения типов' });
  }
});

router.post('/types', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя типа обязательно' });
  try {
    const result = db.prepare('INSERT INTO part_types (name) VALUES (?)').run(name.trim());
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Такой тип уже существует' });
    res.status(500).json({ error: 'Ошибка создания типа' });
  }
});

router.put('/types/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя типа обязательно' });
  try {
    const info = db.prepare('UPDATE part_types SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Тип не найден' });
    res.json({ id: Number(req.params.id), name: name.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Такой тип уже существует' });
    res.status(500).json({ error: 'Ошибка обновления типа' });
  }
});

router.delete('/types/:id', (req, res) => {
  try {
    // Проверим, не используется ли тип
    const used = db.prepare('SELECT COUNT(*) AS cnt FROM inventory WHERE type_id = ?').get(req.params.id);
    if (used.cnt > 0) return res.status(400).json({ error: 'Тип используется в запчастях, удаление невозможно' });
    db.prepare('DELETE FROM part_types WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления типа' });
  }
});

// ========== ОБОРУДОВАНИЕ ==========
router.get('/equipment', (req, res) => {
  try {
    const equipment = db.prepare('SELECT * FROM equipment ORDER BY name').all();
    res.json(equipment);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения оборудования' });
  }
});

router.post('/equipment', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя оборудования обязательно' });
  try {
    const result = db.prepare('INSERT INTO equipment (name) VALUES (?)').run(name.trim());
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Такое оборудование уже существует' });
    res.status(500).json({ error: 'Ошибка создания оборудования' });
  }
});

router.put('/equipment/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя оборудования обязательно' });
  try {
    const info = db.prepare('UPDATE equipment SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Оборудование не найдено' });
    res.json({ id: Number(req.params.id), name: name.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Такое оборудование уже существует' });
    res.status(500).json({ error: 'Ошибка обновления оборудования' });
  }
});

router.delete('/equipment/:id', (req, res) => {
  try {
    // Проверим использование в inventory и write_offs
    const usedInv = db.prepare('SELECT COUNT(*) AS cnt FROM inventory WHERE equipment_id = ?').get(req.params.id);
    const usedWO = db.prepare('SELECT COUNT(*) AS cnt FROM write_offs WHERE equipment_id = ?').get(req.params.id);
    if (usedInv.cnt > 0 || usedWO.cnt > 0) {
      return res.status(400).json({ error: 'Оборудование используется в запчастях или списаниях, удаление невозможно' });
    }
    db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления оборудования' });
  }
});

module.exports = router;

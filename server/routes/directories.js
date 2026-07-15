const pool = require('../db');
const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');

// Получение типов
router.get('/types', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM part_types ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения типов' });
  }
});

// Получить все отделы (открыто для всех)
router.get('/departments', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM departments ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения отделов' });
  }
});

// Добавление типа (модератор/админ)
router.post('/types', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя типа обязательно' });
  try {
    const result = await pool.query('INSERT INTO part_types (name) VALUES ($1) RETURNING id', [name.trim()]);
    res.json({ id: result.rows[0].id, name: name.trim() });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Такой тип уже существует' });
    res.status(500).json({ error: 'Ошибка создания типа' });
  }
});

// Обновление типа
router.put('/types/:id', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя типа обязательно' });
  try {
    const result = await pool.query('UPDATE part_types SET name = $1 WHERE id = $2 RETURNING id', [name.trim(), req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Тип не найден' });
    res.json({ id: Number(req.params.id), name: name.trim() });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Такой тип уже существует' });
    res.status(500).json({ error: 'Ошибка обновления типа' });
  }
});

// Удаление типа
router.delete('/types/:id', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  try {
    const used = await pool.query('SELECT COUNT(*) as cnt FROM inventory WHERE type_id = $1', [req.params.id]);
    if (used.rows[0].cnt > 0) return res.status(400).json({ error: 'Тип используется в запчастях, удаление невозможно' });
    await pool.query('DELETE FROM part_types WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления типа' });
  }
});

// Аналогично для оборудования
router.get('/equipment', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipment ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения оборудования' });
  }
});

router.post('/equipment', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя оборудования обязательно' });
  try {
    const result = await pool.query('INSERT INTO equipment (name) VALUES ($1) RETURNING id', [name.trim()]);
    res.json({ id: result.rows[0].id, name: name.trim() });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Такое оборудование уже существует' });
    res.status(500).json({ error: 'Ошибка создания оборудования' });
  }
});

router.put('/equipment/:id', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя оборудования обязательно' });
  try {
    const result = await pool.query('UPDATE equipment SET name = $1 WHERE id = $2 RETURNING id', [name.trim(), req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Оборудование не найдено' });
    res.json({ id: Number(req.params.id), name: name.trim() });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Такое оборудование уже существует' });
    res.status(500).json({ error: 'Ошибка обновления оборудования' });
  }
});

router.delete('/equipment/:id', authMiddleware, requireRole('admin', 'moderator'), async (req, res) => {
  try {
    const usedInv = await pool.query('SELECT COUNT(*) as cnt FROM inventory WHERE equipment_id = $1', [req.params.id]);
    const usedWO = await pool.query('SELECT COUNT(*) as cnt FROM write_offs WHERE equipment_id = $1', [req.params.id]);
    if (usedInv.rows[0].cnt > 0 || usedWO.rows[0].cnt > 0) {
      return res.status(400).json({ error: 'Оборудование используется, удаление невозможно' });
    }
    await pool.query('DELETE FROM equipment WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления оборудования' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ======== ПОЛЬЗОВАТЕЛИ ========

// Получить всех пользователей (с отделами)
router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.email, u.role, u.department_id, d.name AS department_name, u.created_at
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY u.username`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// Создать пользователя
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, display_name, email, password, role, department_id } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password, role обязательны' });
  }
  const validRoles = ['admin', 'moderator', 'storekeeper', 'user'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }
  if ((role === 'user' || role === 'storekeeper') && !department_id) {
    return res.status(400).json({ error: 'Для данной роли необходимо указать отдел' });
  }
  try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const result = await pool.query(
      'INSERT INTO users (username, display_name, email, password_hash, role, department_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, display_name, email, role, department_id',
      [username, display_name || null, email || null, hash, role, department_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

// Обновить пользователя
router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const userId = req.params.id;
  const { username, display_name, email, role, department_id, password } = req.body;

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const validRoles = ['admin', 'moderator', 'storekeeper', 'user'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }

    let query = 'UPDATE users SET ';
    const values = [];
    let paramCount = 1;

    if (username !== undefined && username !== null && username !== '') {
      query += `username = $${paramCount++}, `;
      values.push(username);
    }
    if (display_name !== undefined) {
      query += `display_name = $${paramCount++}, `;
      values.push(display_name);
    }
    if (email !== undefined) {
      query += `email = $${paramCount++}, `;
      values.push(email);
    }
    if (role) {
      query += `role = $${paramCount++}, `;
      values.push(role);
    }
    if (department_id !== undefined) {
      query += `department_id = $${paramCount++}, `;
      values.push(department_id);
    }
    if (password && password.trim() !== '') {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);
      query += `password_hash = $${paramCount++}, `;
      values.push(hash);
    }

    query = query.slice(0, -2); // убрать последнюю запятую
    query += ` WHERE id = $${paramCount++}`;
    values.push(userId);

    await pool.query(query, values);

    const updated = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.email, u.role, u.department_id, d.name AS department_name
       FROM users u LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [userId]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления пользователя' });
  }
});

// Удалить пользователя
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const userId = req.params.id;
  try {
    if (req.user.id == userId) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления пользователя' });
  }
});

// ======== ОТДЕЛЫ ========

// Получить все отделы
router.get('/departments', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM departments ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения отделов' });
  }
});

// Создать отдел
router.post('/departments', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название отдела обязательно' });
  }
  try {
    const result = await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id, name', [name.trim()]);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Отдел с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания отдела' });
  }
});

// Обновить отдел
router.put('/departments/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }
  try {
    const result = await pool.query('UPDATE departments SET name = $1 WHERE id = $2 RETURNING id, name', [name.trim(), req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Отдел не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Отдел с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления отдела' });
  }
});

// Удалить отдел (только если нет связанных записей)
router.delete('/departments/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const deptId = req.params.id;
  try {
    const usersCount = await pool.query('SELECT COUNT(*) AS cnt FROM users WHERE department_id = $1', [deptId]);
    const invCount = await pool.query('SELECT COUNT(*) AS cnt FROM inventory WHERE department_id = $1', [deptId]);
    const woCount = await pool.query('SELECT COUNT(*) AS cnt FROM write_offs WHERE department_id = $1', [deptId]);
    if (usersCount.rows[0].cnt > 0 || invCount.rows[0].cnt > 0 || woCount.rows[0].cnt > 0) {
      return res.status(400).json({ error: 'Отдел используется и не может быть удалён' });
    }
    await pool.query('DELETE FROM departments WHERE id = $1', [deptId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления отдела' });
  }
});

module.exports = router;

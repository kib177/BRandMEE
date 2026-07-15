const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, department_id, created_at FROM users ORDER BY username'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, password, role, department_id } = req.body;
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
      'INSERT INTO users (username, password_hash, role, department_id) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
      [username, hash, role, department_id || null]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания пользователя' });
  }
});

router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, role, department_id, password } = req.body;
  const userId = req.params.id;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const validRoles = ['admin', 'moderator', 'storekeeper', 'user'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }
    let updateQuery = 'UPDATE users SET ';
    const values = [];
    let paramCount = 1;
    if (username) {
      updateQuery += `username = $${paramCount++}, `;
      values.push(username);
    }
    if (role) {
      updateQuery += `role = $${paramCount++}, `;
      values.push(role);
    }
    if (department_id !== undefined) {
      updateQuery += `department_id = $${paramCount++}, `;
      values.push(department_id);
    }
    if (password) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);
      updateQuery += `password_hash = $${paramCount++}, `;
      values.push(hash);
    }
    updateQuery = updateQuery.slice(0, -2);
    updateQuery += ` WHERE id = $${paramCount++}`;
    values.push(userId);
    await pool.query(updateQuery, values);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления пользователя' });
  }
});

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

module.exports = router;

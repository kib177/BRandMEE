const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'warehouse_secret_key_change_me';
const TOKEN_EXPIRES_IN = '5d';   // 5 дней

// Логин
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      department_id: user.department_id,
      email: user.email,
      display_name: user.display_name
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        department_id: user.department_id,
        email: user.email,
        display_name: user.display_name
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка токена (возвращает информацию о текущем пользователе)
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Токен отсутствует' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, username, display_name, role, department_id, email FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
});

// Обновление собственного профиля (логин, пароль, email) – обычный пользователь
router.put('/update-profile', authMiddleware, async (req, res) => {
  const { currentPassword, newUsername, newPassword, newEmail } = req.body;
  if (!currentPassword) {
    return res.status(400).json({ error: 'Текущий пароль обязателен' });
  }

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (newUsername && newUsername !== user.username) {
      updates.push(`username = $${paramCount++}`);
      values.push(newUsername);
    }
    if (newPassword) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(newPassword, salt);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(hash);
    }
    if (newEmail !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(newEmail);
    }
    // display_name не обновляем – обычный пользователь не может менять имя

    if (updates.length === 0) {
      return res.json({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          department_id: user.department_id,
          display_name: user.display_name
        }
      });
    }

    values.push(req.user.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);

    const updatedUser = await pool.query(
      'SELECT id, username, display_name, email, role, department_id FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ ok: true, user: updatedUser.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Логин уже занят' });
    }
    res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

module.exports = router;

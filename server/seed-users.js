require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seedUsers() {
  const salt = bcrypt.genSaltSync(10);

  const users = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'moderator', password: 'moderator123', role: 'moderator' }
  ];

  for (const u of users) {
    const hash = bcrypt.hashSync(u.password, salt);
    try {
      await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
        [u.username, hash, u.role]
      );
      console.log(`Пользователь ${u.username} добавлен`);
    } catch (err) {
      console.error(`Ошибка при добавлении ${u.username}:`, err.message);
    }
  }

  await pool.end();
}

seedUsers();

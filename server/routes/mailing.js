const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendMail } = require('../mailer');
const pool = require('../db');
const { logAction } = require('../log/logger');

// Отправка рассылки (только админ)
router.post('/send', authMiddleware, requireRole('admin'), async (req, res) => {
  const { recipients, subject, text, html } = req.body;

  if (!subject || (!text && !html)) {
    return res.status(400).json({ error: 'Тема и текст обязательны' });
  }

  let toAddresses = [];

  try {
    // recipients может быть:
    // - строкой "all" — все пользователи
    // - строкой с ID отделов через запятую "1,2"
    // - строкой с email-адресами через запятую

    if (recipients === 'all') {
      const result = await pool.query("SELECT email FROM users WHERE email IS NOT NULL AND email <> ''");
      toAddresses = result.rows.map(row => row.email);
    } else if (/^\d+(,\d+)*$/.test(recipients)) {
      // ID отделов
      const deptIds = recipients.split(',').map(id => parseInt(id));
      const result = await pool.query(
        "SELECT email FROM users WHERE department_id = ANY($1) AND email IS NOT NULL AND email <> ''",
        [deptIds]
      );
      toAddresses = result.rows.map(row => row.email);
    } else {
      // Просто список email через запятую
      toAddresses = recipients.split(',').map(s => s.trim()).filter(s => s);
    }

    if (toAddresses.length === 0) {
      return res.status(400).json({ error: 'Нет получателей' });
    }

    // Отправляем письма (последовательно, чтобы не заспамить SMTP)
    for (const email of toAddresses) {
      try {
        await sendMail({
          to: email,
          subject: subject,
          text: text || '',
          html: html || ''
        });
      } catch (err) {
        console.error(`Ошибка отправки на ${email}:`, err.message);
        // продолжаем, не падаем
      }
    }

    res.json({ ok: true, sent: toAddresses.length });
logAction({
    user: req.user,
    action: 'send_mailing',
    entityType: 'mailing',
    details: { subject, recipientsCount: toAddresses.length },
    req
}).catch(() => {});
    
  } catch (err) {
    console.error('Ошибка рассылки:', err);
    res.status(500).json({ error: 'Ошибка отправки рассылки' });
  }
});

// Получить список отделов и email'ов для подсказок (только админ)
router.get('/data', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const users = await pool.query("SELECT email, department_id FROM users WHERE email IS NOT NULL AND email <> ''");
    const departments = await pool.query("SELECT id, name FROM departments ORDER BY name");
    res.json({
      users: users.rows,
      departments: departments.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

module.exports = router;

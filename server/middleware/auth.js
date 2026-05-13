const AUTH_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${AUTH_PASSWORD}`) {
    return res.status(401).json({ error: 'Неверный пароль авторизации' });
  }
  next();
}

module.exports = { authMiddleware, AUTH_PASSWORD };
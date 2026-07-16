const pool = require('./db');

async function logAction({ user, action, entityType, entityId, details, req }) {
    if (!user) return;
    const ip = req?.ip || req?.connection?.remoteAddress || null;
    try {
        await pool.query(
            `INSERT INTO audit_log (user_id, username, role, action, entity_type, entity_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                user.id,
                user.username,
                user.role,
                action,
                entityType || null,
                entityId || null,
                details ? JSON.stringify(details) : null,
                ip
            ]
        );
    } catch (err) {
        console.error('Ошибка записи лога:', err.message);
    }
}

module.exports = { logAction };

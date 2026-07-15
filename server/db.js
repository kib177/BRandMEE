/**
 * Warehouse Management System
 * Copyright (c) 2026 Kirill Brigi
 * Licensed under MIT
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'warehouse_db',
  user: process.env.DB_USER || 'warehouse_admin',
  password: process.env.DB_PASSWORD || 'твой_пароль',
  max: 20,
  idleTimeoutMillis: 30000
});

module.exports = pool;

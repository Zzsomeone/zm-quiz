const { query } = require('../lib/db');
const bcrypt = require('bcryptjs');
const { JWT_SECRET } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 验证 SETUP_KEY（同时支持驼峰和下划线风格）
  const setupKey = req.headers['x-setup-key'] || (req.body || {}).setupKey || (req.body || {}).setup_key;
  if (!setupKey || setupKey !== process.env.SETUP_KEY) {
    return res.status(403).json({ error: '初始化密钥错误' });
  }

  try {
    // 创建表
    await query(`
      CREATE TABLE IF NOT EXISTS quiz_results (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        mbti_type VARCHAR(4) NOT NULL,
        type_name VARCHAR(100),
        dim_e FLOAT DEFAULT 0,
        dim_i FLOAT DEFAULT 0,
        dim_s FLOAT DEFAULT 0,
        dim_n FLOAT DEFAULT 0,
        dim_t FLOAT DEFAULT 0,
        dim_f FLOAT DEFAULT 0,
        dim_j FLOAT DEFAULT 0,
        dim_p FLOAT DEFAULT 0,
        answers JSONB,
        user_agent TEXT,
        screen VARCHAR(20),
        price_range VARCHAR(20),
        interest_categories JSONB,
        feedback TEXT
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS dashboard_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'viewer',
        display_name VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER
      );
    `);

    // 创建管理员账号
    const adminPassword = (req.body || {}).adminPassword || (req.body || {}).admin_password || 'admin123';
    const adminUsername = (req.body || {}).adminUsername || (req.body || {}).admin_username || 'admin';
    const hash = await bcrypt.hash(adminPassword, 10);

    try {
      await query(
        'INSERT INTO dashboard_users (username, password_hash, role, display_name) VALUES ($1,$2,$3,$4)',
        [adminUsername, hash, 'admin', '管理员']
      );
      return res.status(200).json({
        ok: true,
        message: '数据库初始化成功，管理员账号已创建',
        admin: { username: adminUsername, role: 'admin' }
      });
    } catch (err) {
      if (err.code === '23505') {
        // 管理员已存在，更新密码
        await query(
          'UPDATE dashboard_users SET password_hash = $1 WHERE username = $2',
          [hash, adminUsername]
        );
        return res.status(200).json({
          ok: true,
          message: '数据库已初始化，管理员密码已更新',
          admin: { username: adminUsername, role: 'admin' }
        });
      }
      throw err;
    }
  } catch (err) {
    console.error('Setup error:', err);
    return res.status(500).json({ error: err.message });
  }
};

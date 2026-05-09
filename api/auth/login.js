const { query } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const { signToken } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const userRes = await query(
      'SELECT id, username, password_hash, role, display_name FROM dashboard_users WHERE username = $1',
      [username]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = userRes.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name
    });

    return res.status(200).json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message });
  }
};

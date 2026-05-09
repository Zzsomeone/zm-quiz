const { query } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 列出用户（admin only）
  if (req.method === 'GET') {
    const admin = requireAdmin(req);
    if (!admin) return res.status(403).json({ error: '仅管理员可操作' });

    try {
      const result = await query(
        'SELECT id, username, role, display_name, created_at FROM dashboard_users ORDER BY id'
      );
      return res.status(200).json({ users: result.rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST: 创建用户（admin only）
  if (req.method === 'POST') {
    const admin = requireAdmin(req);
    if (!admin) return res.status(403).json({ error: '仅管理员可操作' });

    try {
      const { username, password, role = 'viewer', display_name = '' } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
      }
      if (password.length < 4) {
        return res.status(400).json({ error: '密码至少4位' });
      }
      if (!['admin', 'viewer'].includes(role)) {
        return res.status(400).json({ error: '角色只能是 admin 或 viewer' });
      }

      const hash = await bcrypt.hash(password, 10);
      const result = await query(
        'INSERT INTO dashboard_users (username, password_hash, role, display_name, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, role, display_name',
        [username, hash, role, display_name, admin.id]
      );

      return res.status(200).json({ ok: true, user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: '用户名已存在' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE: 删除用户（admin only）
  if (req.method === 'DELETE') {
    const admin = requireAdmin(req);
    if (!admin) return res.status(403).json({ error: '仅管理员可操作' });

    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: '缺少用户ID' });
      if (parseInt(id) === admin.id) return res.status(400).json({ error: '不能删除自己' });

      await query('DELETE FROM dashboard_users WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

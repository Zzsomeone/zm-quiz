const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES = '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Vercel serverless function 中提取 Bearer token
function extractUser(req) {
  const auth = req.headers['authorization'] || '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return null;
  return verifyToken(match[1]);
}

// 只允许 admin 角色
function requireAdmin(req) {
  const user = extractUser(req);
  if (!user || user.role !== 'admin') return null;
  return user;
}

module.exports = { signToken, verifyToken, extractUser, requireAdmin, JWT_SECRET };

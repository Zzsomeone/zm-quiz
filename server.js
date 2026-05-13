// ============================================================
// 珠免酒鬼人格测试 - Node.js + Express + sql.js 后端
// ============================================================
'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const sqljs   = require('sql.js');

const PORT  = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DB_PATH = IS_PROD ? '/tmp/survey.db' : path.join(__dirname, 'db', 'survey.db');
const ADMIN_USER     = process.env.ADMIN_USER     || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Token secret – rotate with ADMIN_PASSWORD if leaked
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'zm-quiz-secret-2025';

let db; // sql.js database instance

// ── 初始化数据库 ──────────────────────────────────────────────
async function initDatabase() {
  const SQL = await sqljs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database at', DB_PATH);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      mbti_type  TEXT,
      type_name  TEXT,
      dim_e      INTEGER DEFAULT 0,
      dim_i      INTEGER DEFAULT 0,
      dim_s      INTEGER DEFAULT 0,
      dim_n      INTEGER DEFAULT 0,
      dim_t      INTEGER DEFAULT 0,
      dim_f      INTEGER DEFAULT 0,
      dim_j      INTEGER DEFAULT 0,
      dim_p      INTEGER DEFAULT 0,
      answers    TEXT,
      user_agent TEXT,
      screen     TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  saveDb();
}

// ── 持久化到磁盘 ──────────────────────────────────────────────
function saveDb() {
  if (!db) return;
  try {
    const buf = db.export();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, buf);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

// 每 30 秒自动保存（Railway 容器不杀进程时可以靠这个恢复）
setInterval(saveDb, 30_000);

// 优雅退出时保存
process.on('SIGTERM', () => { saveDb(); process.exit(0); });
process.on('SIGINT',  () => { saveDb(); process.exit(0); });

// ── Express 应用 ───────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── 鉴权中间件 ────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: '未登录' });

  const parts = token.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: '无效凭证' });
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (!payload.user || !payload.exp || payload.exp < Date.now()) {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    req.adminUser = payload.user;
    next();
  } catch {
    return res.status(401).json({ error: '无效凭证' });
  }
}

// ── 路由：提交问卷 ───────────────────────────────────────────
app.post('/api/submit', (req, res) => {
  try {
    const { mbti_type, type_name, dim_scores, answers, ua, screen } = req.body;
    if (!mbti_type || !type_name) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    db.run(
      `INSERT INTO submissions
        (mbti_type, type_name, dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p, answers, user_agent, screen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mbti_type,
        type_name,
        dim_scores?.E ?? 0,
        dim_scores?.I ?? 0,
        dim_scores?.S ?? 0,
        dim_scores?.N ?? 0,
        dim_scores?.T ?? 0,
        dim_scores?.F ?? 0,
        dim_scores?.J ?? 0,
        dim_scores?.P ?? 0,
        JSON.stringify(answers || {}),
        ua || '',
        screen || '',
      ]
    );

    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    saveDb();
    res.json({ ok: true, id });
  } catch (err) {
    console.error('[submit]', err);
    res.status(500).json({ error: '提交失败' });
  }
});

// ── 路由：统计数据（看板用） ───────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const { start, end, mbti } = req.query;

    let where = [];
    let params = [];
    if (start) { where.push('date(created_at) >= date(?)'); params.push(start); }
    if (end)   { where.push('date(created_at) <= date(?)'); params.push(end); }
    if (mbti)  { where.push('mbti_type = ?');               params.push(mbti); }
    const WHERE = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // 总人数 & 今日新增
    const total = db.exec(`SELECT COUNT(*) FROM submissions ${WHERE}`, params)[0]?.values[0][0] ?? 0;

    const todayWhere = WHERE ? WHERE + " AND date(created_at) = date('now','localtime')" : "WHERE date(created_at) = date('now','localtime')";
    const today = db.exec(`SELECT COUNT(*) FROM submissions ${todayWhere}`, params)[0]?.values[0][0] ?? 0;

    // 最热人格
    const topRow = db.exec(
      `SELECT mbti_type, COUNT(*) as cnt FROM submissions ${WHERE} GROUP BY mbti_type ORDER BY cnt DESC LIMIT 1`,
      params
    )[0];
    const topType = topRow ? topRow.values[0][0] : '—';
    const topCount = topRow ? topRow.values[0][1] : 0;

    // 日均
    const daysRow = db.exec(
      `SELECT COUNT(DISTINCT date(created_at)) FROM submissions ${WHERE}`, params
    )[0];
    const activeDays = daysRow?.values[0][0] ?? 1;
    const dailyAvg = Math.round((total / activeDays) * 10) / 10;

    // 人格分布
    const dist = db.exec(
      `SELECT mbti_type, COUNT(*) as cnt FROM submissions ${WHERE} GROUP BY mbti_type ORDER BY cnt DESC`,
      params
    )[0];
    const mbtiDist = {};
    (dist?.values || []).forEach(([k, v]) => { mbtiDist[k] = v; });

    // 维度总得分（E/I 合计，S/N 合计 …）
    const dimRow = db.exec(
      `SELECT SUM(dim_e),SUM(dim_i),SUM(dim_s),SUM(dim_n),SUM(dim_t),SUM(dim_f),SUM(dim_j),SUM(dim_p) FROM submissions ${WHERE}`,
      params
    )[0];
    const dims = dimRow?.values[0] || [0,0,0,0,0,0,0,0];

    // 每日趋势（最近14天）
    const trendRaw = db.exec(
      `SELECT date(created_at) as day, COUNT(*) as cnt
       FROM submissions
       ${WHERE}
       GROUP BY day
       ORDER BY day DESC
       LIMIT 14`,
      params
    )[0];
    const trend = (trendRaw?.values || []).map(([day, cnt]) => ({ day, count: cnt })).reverse();

    res.json({
      total, today, topType, topCount, dailyAvg,
      mbtiDist, dims, trend,
    });
  } catch (err) {
    console.error('[stats]', err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// ── 路由：明细数据 ───────────────────────────────────────────
app.get('/api/data', requireAuth, (req, res) => {
  try {
    const { start, end, mbti, page = 1 } = req.query;
    const PAGE_SIZE = 50;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;

    let where = [];
    let params = [];
    if (start) { where.push('date(created_at) >= date(?)'); params.push(start); }
    if (end)   { where.push('date(created_at) <= date(?)'); params.push(end); }
    if (mbti)  { where.push('mbti_type = ?');               params.push(mbti); }
    const WHERE = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const rows = db.exec(
      `SELECT id, created_at, mbti_type, type_name,
              dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p, screen
       FROM submissions ${WHERE}
       ORDER BY created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params
    )[0];

    const totalRow = db.exec(`SELECT COUNT(*) FROM submissions ${WHERE}`, params)[0];
    const total = totalRow?.values[0][0] ?? 0;

    const data = (rows?.values || []).map(r => ({
      id: r[0], created_at: r[1], mbti: r[2], name: r[3],
      e: r[4], i: r[5], s: r[6], n: r[7], t: r[8], f: r[9], j: r[10], p: r[11], screen: r[12],
    }));

    res.json({ data, total, page: parseInt(page), pageSize: PAGE_SIZE });
  } catch (err) {
    console.error('[data]', err);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// ── 路由：导出 CSV ───────────────────────────────────────────
app.get('/api/export', requireAuth, (req, res) => {
  try {
    const { start, end, mbti } = req.query;

    let where = [];
    let params = [];
    if (start) { where.push('date(created_at) >= date(?)'); params.push(start); }
    if (end)   { where.push('date(created_at) <= date(?)'); params.push(end); }
    if (mbti)  { where.push('mbti_type = ?');               params.push(mbti); }
    const WHERE = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const rows = db.exec(
      `SELECT created_at, mbti_type, type_name, dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p, screen
       FROM submissions ${WHERE} ORDER BY created_at DESC`,
      params
    )[0];

    const BOM = '\uFEFF';
    const header = BOM + '时间,MBTI,人格名称,E,I,S,N,T,F,J,P,设备\n';
    const body = (rows?.values || []).map(r =>
      [r[0], r[1], `"${(r[2]||'').replace(/"/g,'""')}"`, r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], `"${(r[12]||'').replace(/"/g,'""')}"`].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8-sig');
    res.setHeader('Content-Disposition', `attachment; filename="survey-${Date.now()}.csv"`);
    res.send(header + body);
  } catch (err) {
    console.error('[export]', err);
    res.status(500).json({ error: '导出失败' });
  }
});

// ── 路由：登录 ───────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
      const payload = Buffer.from(JSON.stringify({
        user: username,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      })).toString('base64');
      res.json({ ok: true, token: payload });
    } else {
      res.status(401).json({ error: '用户名或密码错误' });
    }
  } catch (err) {
    res.status(500).json({ error: '登录失败' });
  }
});

// ── 路由：登出 ───────────────────────────────────────────────
app.post('/api/logout', requireAuth, (req, res) => {
  res.json({ ok: true });
});

// ── 路由：备注 CRUD ──────────────────────────────────────────
app.get('/api/notes', requireAuth, (req, res) => {
  try {
    const rows = db.exec('SELECT id, content, created_at FROM notes ORDER BY created_at DESC');
    const data = (rows[0]?.values || []).map(([id, content, created_at]) => ({ id, content, created_at }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: '获取备注失败' });
  }
});

app.post('/api/notes', requireAuth, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });
    db.run('INSERT INTO notes (content) VALUES (?)', [content.trim()]);
    const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    saveDb();
    const row = db.exec(`SELECT id, content, created_at FROM notes WHERE id = ${id}`)[0].values[0];
    res.json({ ok: true, note: { id: row[0], content: row[1], created_at: row[2] } });
  } catch (err) {
    res.status(500).json({ error: '添加备注失败' });
  }
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    db.run('DELETE FROM notes WHERE id = ?', [id]);
    saveDb();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '删除备注失败' });
  }
});

// ── 启动 ─────────────────────────────────────────────────────
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] DB: ${DB_PATH}`);
  });
}).catch(err => {
  console.error('[Server] DB init failed:', err);
  process.exit(1);
});

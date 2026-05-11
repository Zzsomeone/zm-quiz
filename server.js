/**
 * 珠免酒鬼人格测试 - 后端服务
 * 
 * 功能：
 * - 静态文件服务（问卷 + 看板）
 * - API: 提交问卷数据
 * - API: 统计图表数据
 * - API: 明细数据查询
 * - API: 导出 Excel
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 管理员账号（可通过环境变量覆盖）
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';

// 简单的 session 存储（生产环境建议用 Redis）
const sessions = new Map();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// 登录 API
// ============================================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    sessions.set(token, { user: username, at: Date.now() });
    // 24小时过期清理
    setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
    res.json({ ok: true, token });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

// 登出
app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// 鉴权中间件
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && sessions.has(token)) {
    next();
  } else {
    res.status(401).json({ error: '请先登录' });
  }
}

// 初始化数据库
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/survey.db'  // 云平台通常只允许写 /tmp
  : path.join(__dirname, 'db', 'survey.db');

// 确保目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    mbti_type TEXT NOT NULL,
    type_name TEXT,
    dim_e INTEGER DEFAULT 0,
    dim_i INTEGER DEFAULT 0,
    dim_s INTEGER DEFAULT 0,
    dim_n INTEGER DEFAULT 0,
    dim_t INTEGER DEFAULT 0,
    dim_f INTEGER DEFAULT 0,
    dim_j INTEGER DEFAULT 0,
    dim_p INTEGER DEFAULT 0,
    answers TEXT,
    user_agent TEXT,
    screen TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_created_at ON submissions(created_at);
  CREATE INDEX IF NOT EXISTS idx_mbti ON submissions(mbti_type);
`);

// ============================================================
// API: 提交问卷数据
// ============================================================
app.post('/api/submit', (req, res) => {
  try {
    const { mbti_type, type_name, dim_scores, answers, ua, screen } = req.body;
    
    if (!mbti_type) {
      return res.status(400).json({ ok: false, error: '缺少 mbti_type' });
    }

    const stmt = db.prepare(`
      INSERT INTO submissions 
      (mbti_type, type_name, dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p, answers, user_agent, screen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      mbti_type,
      type_name || '',
      dim_scores?.E || 0,
      dim_scores?.I || 0,
      dim_scores?.S || 0,
      dim_scores?.N || 0,
      dim_scores?.T || 0,
      dim_scores?.F || 0,
      dim_scores?.J || 0,
      dim_scores?.P || 0,
      JSON.stringify(answers || {}),
      ua || '',
      screen || ''
    );

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// API: 统计数据（图表）
// ============================================================
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    
    // 构建日期筛选
    let dateFilter = '';
    const params = [];
    if (date_from && date_to) {
      dateFilter = `WHERE DATE(created_at) BETWEEN ? AND ?`;
      params.push(date_from, date_to);
    }

    // 总数 & 今日
    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM submissions`).get();
    const todayRow = db.prepare(`
      SELECT COUNT(*) as today FROM submissions 
      WHERE DATE(created_at) = DATE('now', 'localtime')
    `).get();
    const yesterdayRow = db.prepare(`
      SELECT COUNT(*) as yesterday FROM submissions 
      WHERE DATE(created_at) = DATE('now', 'localtime', '-1 day')
    `).get();

    // 最热门人格
    const topMbti = db.prepare(`
      SELECT mbti_type, COUNT(*) as cnt 
      FROM submissions ${dateFilter}
      GROUP BY mbti_type 
      ORDER BY cnt DESC 
      LIMIT 1
    `).get(...params);

    // 日均
    const dateRange = db.prepare(`
      SELECT 
        COUNT(DISTINCT DATE(created_at)) as days,
        MIN(DATE(created_at)) as first_date,
        MAX(DATE(created_at)) as last_date
      FROM submissions ${dateFilter}
    `).get(...params);
    const avgDaily = dateRange.days > 0 ? Math.round(totalRow.total / dateRange.days) : 0;

    // 饼图数据
    const pieData = db.prepare(`
      SELECT mbti_type, COUNT(*) as cnt 
      FROM submissions ${dateFilter}
      GROUP BY mbti_type 
      ORDER BY cnt DESC
    `).all(...params);

    const pieChart = [{
      type: 'pie',
      labels: pieData.map(r => r.mbti_type),
      values: pieData.map(r => r.cnt),
      hole: 0.4,
      marker: { colors: pieData.map(r => MBTI_COLORS[r.mbti_type] || '#999') },
      textinfo: 'label+percent',
      textposition: 'inside',
      automargin: true
    }];

    // 柱状图：维度对比
    const dimSums = db.prepare(`
      SELECT 
        SUM(dim_e) as E, SUM(dim_i) as I,
        SUM(dim_s) as S, SUM(dim_n) as N,
        SUM(dim_t) as T, SUM(dim_f) as F,
        SUM(dim_j) as J, SUM(dim_p) as P
      FROM submissions ${dateFilter}
    `).get(...params);

    const barChart = [{
      type: 'bar',
      x: ['聚场 E', '独酌 I', '经典 S', '尝鲜 N', '实用 T', '享受 F', '目标 J', '随缘 P'],
      y: [dimSums.E || 0, dimSums.I || 0, dimSums.S || 0, dimSums.N || 0, 
          dimSums.T || 0, dimSums.F || 0, dimSums.J || 0, dimSums.P || 0],
      marker: { color: ['#3498DB', '#9B59B6', '#F39C12', '#E74C3C', '#1ABC9C', '#2ECC71', '#E67E22', '#D35400'] },
      textposition: 'auto'
    }];

    // 折线图：每日趋势
    const dailyData = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as cnt
      FROM submissions ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all(...params);

    const lineChart = [{
      type: 'scatter',
      mode: 'lines+markers',
      x: dailyData.map(r => r.date),
      y: dailyData.map(r => r.cnt),
      line: { color: '#E94560', width: 3 },
      marker: { size: 8 },
      fill: 'tozeroy',
      fillcolor: 'rgba(233,69,96,0.15)'
    }];

    res.json({
      summary: {
        total: totalRow.total,
        today: todayRow.today,
        yesterday: yesterdayRow.yesterday,
        top_mbti: topMbti?.mbti_type || null,
        avg_daily: avgDaily,
        date_range: dateRange.first_date && dateRange.last_date 
          ? `${dateRange.first_date} ~ ${dateRange.last_date}` 
          : '暂无数据'
      },
      charts: {
        pie: pieChart,
        bar: barChart,
        line: lineChart
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API: 明细数据（表格）
// ============================================================
app.get('/api/data', requireAuth, (req, res) => {
  try {
    const { date_from, date_to, mbti, page = 1, page_size = 50 } = req.query;
    const offset = (page - 1) * page_size;

    // 构建 WHERE 条件
    const conditions = [];
    const params = [];

    if (date_from && date_to) {
      conditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }
    if (mbti) {
      conditions.push('mbti_type = ?');
      params.push(mbti);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM submissions ${whereClause}`).get(...params);

    // 查询数据
    const dataRows = db.prepare(`
      SELECT id, created_at, mbti_type, type_name, 
             dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p,
             screen
      FROM submissions 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(page_size), offset);

    // 格式化时间
    const data = dataRows.map(r => ({
      ...r,
      created_at: new Date(r.created_at).toLocaleString('zh-CN', { 
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      })
    }));

    res.json({
      total: countRow.total,
      page: parseInt(page),
      page_size: parseInt(page_size),
      data
    });
  } catch (err) {
    console.error('Data error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API: 导出 Excel (CSV)
// ============================================================
app.get('/api/export', requireAuth, (req, res) => {
  try {
    const { date_from, date_to, mbti } = req.query;

    const conditions = [];
    const params = [];

    if (date_from && date_to) {
      conditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }
    if (mbti) {
      conditions.push('mbti_type = ?');
      params.push(mbti);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT id, created_at, mbti_type, type_name, 
             dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p,
             user_agent, screen
      FROM submissions 
      ${whereClause}
      ORDER BY created_at DESC
    `).all(...params);

    // 生成 CSV
    const headers = ['ID', '提交时间', 'MBTI类型', '人格名称', 
                     'E得分', 'I得分', 'S得分', 'N得分', 'T得分', 'F得分', 'J得分', 'P得分',
                     '设备', '屏幕'];
    const csvLines = [headers.join(',')];

    rows.forEach(r => {
      const line = [
        r.id,
        `"${new Date(r.created_at).toLocaleString('zh-CN')}"`,
        r.mbti_type,
        `"${r.type_name || ''}"`,
        r.dim_e, r.dim_i, r.dim_s, r.dim_n, r.dim_t, r.dim_f, r.dim_j, r.dim_p,
        `"${(r.user_agent || '').substring(0, 50)}"`,
        `"${r.screen || ''}"`
      ].join(',');
      csvLines.push(line);
    });

    const csvContent = '\uFEFF' + csvLines.join('\n'); // BOM for Excel

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=survey_export_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MBTI 颜色映射
// ============================================================
const MBTI_COLORS = {
  ESTJ: '#C0392B', ESFP: '#27AE60', ENFJ: '#27AE60', ENTP: '#2980B9',
  ENTJ: '#C0392B', ISTJ: '#2980B9', ISFJ: '#27AE60', ISTP: '#27AE60',
  INFP: '#8E44AD', INFJ: '#8E44AD', INTJ: '#2980B9', INTP: '#27AE60',
  ISFP: '#2980B9', ESTP: '#C0392B', ENFP: '#E67E22'
};

// ============================================================
// 启动服务
// ============================================================
app.listen(PORT, () => {
  console.log(`🍸 珠免酒鬼人格测试服务已启动`);
  console.log(`   问卷页面: http://localhost:${PORT}/survey.html`);
  console.log(`   数据看板: http://localhost:${PORT}/dashboard.html`);
  console.log(`   API 端点: http://localhost:${PORT}/api/...`);
});

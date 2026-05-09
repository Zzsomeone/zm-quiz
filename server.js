const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Setup-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// === DB ===
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
let pool;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false }, max: 5 });
  return pool;
}
async function query(text, params) { return getPool().query(text, params); }

// === Auth helpers ===
function signToken(p) { return jwt.sign(p, JWT_SECRET, { expiresIn: '7d' }); }
function verifyToken(t) { try { return jwt.verify(t, JWT_SECRET); } catch(e) { return null; } }
function extractUser(req) {
  const a = req.headers['authorization'] || '';
  const m = a.match(/^Bearer (.+)$/);
  return m ? verifyToken(m[1]) : null;
}
function requireAdmin(req) { const u = extractUser(req); if (!u || u.role !== 'admin') return null; return u; }

// === API: /api/setup ===
app.post('/api/setup', async (req, res) => {
  const sk = req.headers['x-setup-key'] || (req.body || {}).setupKey || (req.body || {}).setup_key;
  if (sk !== process.env.SETUP_KEY) return res.status(403).json({ error: '初始化密钥错误' });
  try {
    await query(`CREATE TABLE IF NOT EXISTS quiz_results (
      id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW(),
      mbti_type VARCHAR(4) NOT NULL, type_name VARCHAR(100),
      dim_e FLOAT DEFAULT 0,dim_i FLOAT DEFAULT 0,dim_s FLOAT DEFAULT 0,
      dim_n FLOAT DEFAULT 0,dim_t FLOAT DEFAULT 0,dim_f FLOAT DEFAULT 0,
      dim_j FLOAT DEFAULT 0,dim_p FLOAT DEFAULT 0,
      answers JSONB, user_agent TEXT, screen VARCHAR(20), price_range VARCHAR(20),
      interest_categories JSONB, feedback TEXT
    )`);
    await query(`CREATE TABLE IF NOT EXISTS dashboard_users (
      id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) DEFAULT 'viewer',
      display_name VARCHAR(100), created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER
    )`);
    const b = req.body || {};
    const hash = await bcrypt.hash(b.adminPassword || b.admin_password || 'admin123', 10);
    const un = b.adminUsername || b.admin_username || 'admin';
    try {
      await query('INSERT INTO dashboard_users (username,password_hash,role,display_name) VALUES($1,$2,$3,$4)', [un,hash,'admin','管理员']);
      return res.json({ ok:true, message:'数据库初始化成功', admin:{username:un,role:'admin'} });
    } catch(err) {
      if (err.code !== '23505') throw err;
      await query('UPDATE dashboard_users SET password_hash=$1 WHERE username=$2', [hash,un]);
      return res.json({ ok:true, message:'数据库已初始化，密码已更新', admin:{username:un,role:'admin'} });
    }
  } catch(err) { console.error('Setup:', err); return res.status(500).json({ error: err.message }); }
});

// === API: /api/auth/login ===
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
    const r = await query('SELECT id,username,password_hash,role,display_name FROM dashboard_users WHERE username=$1', [username]);
    if (!r.rows.length) return res.status(401).json({ error: '用户名或密码错误' });
    const u = r.rows[0];
    if (!(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: '用户名或密码错误' });
    return res.json({ ok:true, token:signToken({id:u.id,username:u.username,role:u.role,displayName:u.display_name}), user:{id:u.id,username:u.username,role:u.role,displayName:u.display_name} });
  } catch(err) { console.error('Login:', err); return res.status(500).json({ error: err.message }); }
});

// === API: /api/submit ===
app.post('/api/submit', async (req, res) => {
  try {
    const b = req.body;
    const dims = b.dim_scores || {};
    const ans = b.answers || {};
    const ic = {}; if (Array.isArray(ans['12'])) ic['12'] = ans['12'];
    const r = await query(`INSERT INTO quiz_results(mbti_type,type_name,dim_e,dim_i,dim_s,dim_n,dim_t,dim_f,dim_j,dim_p,answers,user_agent,screen,price_range,interest_categories,feedback) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [b.mbti_type, b.type_name, dims.E||0,dims.I||0,dims.S||0,dims.N||0,dims.T||0,dims.F||0,dims.J||0,dims.P||0, JSON.stringify(ans), b.ua||'',b.screen||'',ans['13']||b.price_range||'', JSON.stringify(ic), b.feedback||'']);
    return res.json({ ok:true, id:r.rows[0].id });
  } catch(err) { console.error('Submit:', err); return res.status(500).json({ ok:false, error:err.message }); }
});

// === API: /api/data ===
app.get('/api/data', async (req, res) => {
  const u = extractUser(req); if (!u) return res.status(401).json({ error:'请先登录' });
  try {
    let w='WHERE 1=1'; const p=[]; let i=1;
    if(req.query.date_from){w+=` AND created_at>=${'$'+i++}`;p.push(req.query.date_from);}
    if(req.query.date_to){w+=` AND created_at<=${'$'+i++}`;p.push(req.query.date_to+' 23:59:59');}
    if(req.query.mbti){w+=` AND mbti_type=${'$'+i++}`;p.push(req.query.mbti);}
    const pg=parseInt(req.query.page||'1'), ps=Math.min(200,Math.max(1,parseInt(req.query.page_size||'50')));
    const cr=await query(`SELECT COUNT(*) as total FROM quiz_results ${w}`,p);
    const dr=await query(`SELECT id,created_at,mbti_type,type_name,dim_e,dim_i,dim_s,dim_n,dim_t,dim_f,dim_j,dim_p,screen,price_range,feedback FROM quiz_results ${w} ORDER BY created_at DESC LIMIT ${'$'+i++} OFFSET ${'$'+i++}`,[...p,ps,(pg-1)*ps]);
    return res.json({ data:dr.rows.map(r=>({...r,created_at:r.created_at.toISOString().replace('T',' ').slice(0,19)})), total:+cr.rows[0].total, page:pg, page_size:ps });
  } catch(err) { console.error('Data:',err); return res.status(500).json({error:err.message}); }
});

// === API: /api/stats ===
app.get('/api/stats', async (req, res) => {
  const u = extractUser(req); if (!u) return res.status(401).json({ error:'请先登录' });
  try {
    const df=req.query.date_from, dt=req.query.date_to;
    const tr=+((await query(`SELECT COUNT(*) as t FROM quiz_results WHERE ($1::date IS NULL OR created_at>=$1) AND ($2::date IS NULL OR created_at<=$2)`,[df||null,dt||null])).rows[0].t);
    const td=+((await query(`SELECT COUNT(*) as t FROM quiz_results WHERE created_at>=CURRENT_DATE`)).rows[0].t);
    const yd=+((await query(`SELECT COUNT(*) as t FROM quiz_results WHERE created_at>=CURRENT_DATE-INTERVAL'1 day' AND created_at<CURRENT_DATE`)).rows[0].t);
    const md=(await query(`SELECT mbti_type,COUNT(*) as c FROM quiz_results GROUP BY mbti_type ORDER BY c DESC`)).rows;
    const ad=+(await query(`SELECT COUNT(DISTINCT DATE(created_at)) as d FROM quiz_results WHERE created_at>=CURRENT_DATE-INTERVAL'30 days'`)).rows[0].d||1;
    const trend=(await query(`SELECT DATE(created_at) as d,COUNT(*) as c FROM quiz_results WHERE created_at>=CURRENT_DATE-INTERVAL'30 days' GROUP BY DATE(created_at) ORDER BY d`)).rows;
    const avgs=(await query(`SELECT AVG(dim_e)e,AVG(dim_i)i,AVG(dim_s)s,AVG(dim_n)n,AVG(dim_t)t,AVG(dim_f)f,AVG(dim_j)j,AVG(dim_p)p FROM quiz_results WHERE ($1::date IS NULL OR created_at>=$1) AND ($2::date IS NULL OR created_at<=$2)`,[df||null,dt||null])).rows[0];
    return res.json({
      summary:{total:tr,today:td,yesterday:yd,top_mbti:md[0]?.label||'-',avg_daily:Math.round(tr/ad)},
      charts:{
        pie:{data:[{type:'pie',labels:md.map(r=>r.mbti_type),values:md.map(r=>+r.c),hole:.45,textinfo:'label+percent',textposition:'outside'}],layout:{showlegend:false,margin:{t:20,b:20}}},
        bar:{data:[{type:'bar',x:['E','I','S','N','T','F','J','P'],y:[avgs.e,avgs.i,avgs.s,avgs.n,avgs.t,avgs.f,avgs.j,avgs.p].map(v=>v||0)}],layout:{margin:{t:20,b:40},yaxis:{title:'平均分'}}},
        line:{data:[{type:'scatter',mode:'lines+markers',x:trend.map(r=>r.d.toISOString().slice(0,10)),y:trend.map(r=>+r.c),line:{color:'#E94560',width:3}}],layout:{margin:{t:20,b:40},xaxis:{title:'日期'},yaxis:{title:'参与人数'}}}
      }
    });
  } catch(err) { console.error('Stats:',err); return res.status(500).json({error:err.message}); }
});

// === API: /api/export ===
app.get('/api/export', async (req, res) => {
  const u = extractUser(req); if (!u) return res.status(401).json({ error:'请先登录' });
  try {
    let w='WHERE 1=1'; const p=[]; let i=1;
    if(req.query.date_from){w+=` AND created_at>=${'$'+i++}`;p.push(req.query.date_from);}
    if(req.query.date_to){w+=` AND created_at<=${'$'+i++}`;p.push(req.query.date_to+' 23:59:59');}
    if(req.query.mbti){w+=` AND mbti_type=${'$'+i++}`;p.push(req.query.mbti);}
    const dr=await query(`SELECT id,created_at,mbti_type,type_name,dim_e,dim_i,dim_s,dim_n,dim_t,dim_f,dim_j,dim_p,screen,price_range,feedback FROM quiz_results ${w} ORDER BY created_at DESC`,p);
    const h=['ID','时间','MBTI类型','人格名称','E','I','S','N','T','F','J','P','设备','价位','反馈'];
    const rows=dr.rows.map(r=>[`"${r.id}"`,`"${r.created_at.toISOString().replace('T',' ').slice(0,19)}"`,`"${r.mbti_type}"`,`"${r.type_name}"`,r.dim_e,r.dim_i,r.dim_s,r.dim_n,r.dim_t,r.dim_f,r.dim_j,r.dim_p,`"${r.screen||''}"`,`"${r.price_range||''}"`,`"${(r.feedback||'').replace(/"/g,'""')}"`].join(','));
    res.setHeader('Content-Type','text/csv;charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="zm-export-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send('\uFEFF'+h.join(',')+'\n'+rows.join('\n'));
  } catch(err) { console.error('Export:',err); return res.status(500).json({error:err.message}); }
});

// === API: /api/users ===
app.get('/api/users', async (req,res)=>{ const a=requireAdmin(req);if(!a)return res.status(403).json({error:'仅管理员可操作'}); try{const r=await query('SELECT id,username,role,display_name,created_at FROM dashboard_users ORDER BY id');return res.json({users:r.rows});}catch(e){return res.status(500).json({error:e.message});} });
app.post('/api/users', async (req,res)=>{
  const a=requireAdmin(req);if(!a)return res.status(403).json({error:'仅管理员可操作'});
  try{
    const{username,password,role='viewer',display_name=''}=req.body||{};
    if(!username||!password)return res.status(400).json({error:'用户名和密码不能为空'});
    if(!['admin','viewer'].includes(role))return res.status(400).json({error:'角色只能是admin或viewer'});
    const h=await bcrypt.hash(password,10);
    const r=await query('INSERT INTO dashboard_users(username,password_hash,role,display_name,created_by)VALUES($1,$2,$3,$4,$5)RETURNING id,username,role,display_name',[username,h,role,display_name,a.id]);
    return res.json({ok:true,user:r.rows[0]});
  }catch(e){return e.code==='23505'?res.status(400).json({error:'用户名已存在'}):res.status(500).json({error:e.message});}
});
app.delete('/api/users', async (req,res)=>{
  const a=requireAdmin(req);if(!a)return res.status(403).json({error:'仅管理员可操作'});
  try{const{id}=req.body||{};if(!id)return res.status(400).json({error:'缺少用户ID'});if(+id===a.id)return res.status(400).json({error:'不能删除自己'});await query('DELETE FROM dashboard_users WHERE id=$1',[id]);return res.json({ok:true});}catch(e){return res.status(500).json({error:e.message});}
});

// Fallback to index.html for SPA-like routing
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

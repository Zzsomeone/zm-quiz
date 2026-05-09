const { query } = require('../lib/db');
const { extractUser } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = extractUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });

  const { date_from, date_to, mbti } = req.query || {};

  try {
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (date_from) { where += ` AND created_at >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND created_at <= $${idx++}`; params.push(date_to + ' 23:59:59'); }
    if (mbti)      { where += ` AND mbti_type = $${idx++}`; params.push(mbti); }

    const dataRes = await query(
      `SELECT id, created_at, mbti_type, type_name, dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p, screen, price_range, feedback
       FROM quiz_results ${where} ORDER BY created_at DESC`,
      params
    );

    // 生成 CSV
    const headers = ['ID', '时间', 'MBTI类型', '人格名称', 'E', 'I', 'S', 'N', 'T', 'F', 'J', 'P', '设备', '价位', '反馈'];
    const rows = dataRes.rows.map(r => [
      r.id,
      r.created_at.toISOString().replace('T', ' ').slice(0, 19),
      r.mbti_type,
      r.type_name,
      r.dim_e, r.dim_i, r.dim_s, r.dim_n, r.dim_t, r.dim_f, r.dim_j, r.dim_p,
      r.screen,
      r.price_range,
      (r.feedback || '').replace(/"/g, '""')
    ].map(v => `"${v}"`).join(','));

    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zm-quiz-export-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ error: err.message });
  }
};

const { query } = require('../lib/db');
const { extractUser } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = extractUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });

  const { date_from, date_to, mbti, page = '1', page_size = '50' } = req.query || {};
  const p = Math.max(1, parseInt(page, 10));
  const ps = Math.min(200, Math.max(1, parseInt(page_size, 10)));
  const offset = (p - 1) * ps;

  try {
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (date_from) { where += ` AND created_at >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND created_at <= $${idx++}`; params.push(date_to + ' 23:59:59'); }
    if (mbti)      { where += ` AND mbti_type = $${idx++}`; params.push(mbti); }

    // 总数
    const countRes = await query(`SELECT COUNT(*) as total FROM quiz_results ${where}`, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // 数据
    const dataRes = await query(
      `SELECT id, created_at, mbti_type, type_name, dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p, screen, price_range, feedback
       FROM quiz_results ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, ps, offset]
    );

    const data = dataRes.rows.map(r => ({
      id: r.id,
      created_at: r.created_at.toISOString().replace('T', ' ').slice(0, 19),
      mbti_type: r.mbti_type,
      type_name: r.type_name,
      dim_e: r.dim_e, dim_i: r.dim_i,
      dim_s: r.dim_s, dim_n: r.dim_n,
      dim_t: r.dim_t, dim_f: r.dim_f,
      dim_j: r.dim_j, dim_p: r.dim_p,
      screen: r.screen,
      price_range: r.price_range,
      feedback: r.feedback
    }));

    return res.status(200).json({ data, total, page: p, page_size: ps });
  } catch (err) {
    console.error('Data error:', err);
    return res.status(500).json({ error: err.message });
  }
};

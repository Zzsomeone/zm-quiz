const { query } = require('../lib/db');

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    const mbtiType = body.mbti_type;
    const typeName = body.type_name;
    const dims = body.dim_scores || {};
    const answers = body.answers || {};
    const priceRange = answers['13'] || body.price_range || '';
    const interestKeys = ['12']; // 多选题
    const interestCategories = {};
    interestKeys.forEach(k => {
      if (Array.isArray(answers[k])) interestCategories[k] = answers[k];
    });
    const feedback = (answers['18'] && typeof answers['18'] === 'string')
      ? answers['18']
      : (body.feedback || '');

    const result = await query(
      `INSERT INTO quiz_results
        (mbti_type, type_name, dim_e, dim_i, dim_s, dim_n, dim_t, dim_f, dim_j, dim_p, answers, user_agent, screen, price_range, interest_categories, feedback)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        mbtiType,
        typeName,
        dims.E || 0, dims.I || 0,
        dims.S || 0, dims.N || 0,
        dims.T || 0, dims.F || 0,
        dims.J || 0, dims.P || 0,
        JSON.stringify(answers),
        body.ua || '',
        body.screen || '',
        priceRange,
        JSON.stringify(interestCategories),
        body.feedback || ''
      ]
    );

    return res.status(200).json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

const { query } = require('../lib/db');
const { extractUser } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = extractUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });

  const { date_from, date_to } = req.query || {};

  try {
    // 总参与数
    const totalRes = await query(
      `SELECT COUNT(*) as total FROM quiz_results WHERE ($1::date IS NULL OR created_at >= $1) AND ($2::date IS NULL OR created_at <= $2)`,
      [date_from || null, date_to || null]
    );
    const total = parseInt(totalRes.rows[0].total, 10);

    // 今日新增
    const todayRes = await query(
      `SELECT COUNT(*) as today FROM quiz_results WHERE created_at >= CURRENT_DATE`
    );
    const today = parseInt(todayRes.rows[0].today, 10);

    // 昨日
    const yesterdayRes = await query(
      `SELECT COUNT(*) as yesterday FROM quiz_results WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE`
    );
    const yesterday = parseInt(yesterdayRes.rows[0].yesterday, 10);

    // MBTI 分布
    const distRes = await query(
      `SELECT mbti_type, COUNT(*) as count FROM quiz_results GROUP BY mbti_type ORDER BY count DESC`
    );
    const mbtiDist = distRes.rows.map(r => ({
      label: r.mbti_type,
      value: parseInt(r.count, 10)
    }));

    // 最热人格
    const topMbti = mbtiDist[0]?.label || '-';

    // 日均参与
    const daysRes = await query(
      `SELECT COUNT(DISTINCT DATE(created_at)) as days FROM quiz_results WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
    );
    const activeDays = parseInt(daysRes.rows[0].days, 10) || 1;
    const avgDaily = Math.round(total / Math.max(activeDays, 1));

    // 每日趋势
    const trendRes = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count FROM quiz_results WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date`
    );
    const trend = trendRes.rows.map(r => ({
      date: r.date.toISOString().slice(0, 10),
      count: parseInt(r.count, 10)
    }));

    // 维度平均
    const avgRes = await query(
      `SELECT 
        AVG(dim_e) as e, AVG(dim_i) as i,
        AVG(dim_s) as s, AVG(dim_n) as n,
        AVG(dim_t) as t, AVG(dim_f) as f,
        AVG(dim_j) as j, AVG(dim_p) as p
       FROM quiz_results WHERE ($1::date IS NULL OR created_at >= $1) AND ($2::date IS NULL OR created_at <= $2)`,
      [date_from || null, date_to || null]
    );
    const avgs = avgRes.rows[0];

    // Plotly charts
    const pieChart = [{
      type: 'pie',
      labels: mbtiDist.map(d => d.label),
      values: mbtiDist.map(d => d.value),
      hole: 0.45,
      textinfo: 'label+percent',
      textposition: 'outside',
      marker: { colors: mbtiDist.map(d => d.label).map(m => ({
        ESTJ:'#C0392B',ESFP:'#27AE60',ENFJ:'#27AE60',ENTP:'#2980B9',
        ENTJ:'#C0392B',ISTJ:'#2980B9',ISFJ:'#27AE60',ISTP:'#27AE60',
        INFP:'#8E44AD',INFJ:'#8E44AD',INTJ:'#2980B9',INTP:'#27AE60',
        ISFP:'#2980B9',ESTP:'#C0392B',ENFP:'#E67E22'
      }[m] || '#999')) }
    }];

    const barChart = [{
      type: 'bar',
      x: ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'],
      y: [avgs.e, avgs.i, avgs.s, avgs.n, avgs.t, avgs.f, avgs.j, avgs.p].map(v => v || 0),
      marker: { color: ['#3498DB','#9B59B6','#F39C12','#E74C3C','#1ABC9C','#2ECC71','#E67E22','#D35400'] }
    }];

    const lineChart = [{
      type: 'scatter',
      mode: 'lines+markers',
      x: trend.map(t => t.date),
      y: trend.map(t => t.count),
      line: { color: '#E94560', width: 3 },
      marker: { size: 8 }
    }];

    return res.status(200).json({
      summary: {
        total,
        today,
        yesterday,
        top_mbti: topMbti,
        avg_daily: avgDaily,
        date_range: date_from && date_to ? `${date_from} ~ ${date_to}` : '全部时间'
      },
      charts: {
        pie: { data: pieChart, layout: { showlegend: false, margin: { t: 20, b: 20 } } },
        bar: { data: barChart, layout: { margin: { t: 20, b: 40 }, xaxis: { title: '' }, yaxis: { title: '平均分' } } },
        line: { data: lineChart, layout: { margin: { t: 20, b: 40 }, xaxis: { title: '日期' }, yaxis: { title: '参与人数' } } }
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: err.message });
  }
};

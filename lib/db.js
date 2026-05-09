const { Pool } = require('pg');

// Serverless 环境下复用连接池
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : false,
      max: 1,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function query(text, params) {
  const start = Date.now();
  const res = await getPool().query(text, params);
  const duration = Date.now() - start;
  console.log('SQL', { text: text.slice(0, 80), duration: duration + 'ms', rows: res.rowCount });
  return res;
}

module.exports = { query, getPool };

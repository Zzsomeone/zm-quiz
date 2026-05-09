// Create a free Neon database via their API
// We'll use the Vercel-Neon integration flow
const https = require('https');

const VC_TOKEN = 'vca_6SGa2iYeNrF5Be1SRfPHleNJfi17lImkoUh6lblJ0RQZCNX90r1wdCzq';
const PROJECT_ID = 'prj_XwWNZKGyBFZlTxryrs2tYTLIjasy';
const TEAM_ID = 'team_J422Lv2jsgQ0VnXYjxOYER9q';

// Try creating via Neon's Vercel integration
const body = JSON.stringify({
  name: 'Neon Postgres - zm-quiz',
  // Integration type for Neon
});

const options = {
  hostname: 'api.vercel.com',
  path: `/v1/integrations/configuration?teamId=${TEAM_ID}`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${VC_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2).substring(0, 2000));
    } catch {
      console.log(data.substring(0, 2000));
    }
  });
});

req.on('error', e => console.error(e));
req.end();

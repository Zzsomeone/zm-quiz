// Vercel API helper - add env vars and create Postgres
const fs = require('fs');
const path = require('path');

// Find token from vercel config
const homeDir = process.env.USERPROFILE || process.env.HOME;
const possiblePaths = [
  path.join(homeDir, '.vercel', 'auth.json'),
  path.join(process.env.LOCALAPPDATA || '', 'vercel', 'auth.json'),
  path.join(process.env.APPDATA || '', 'vercel', 'auth.json'),
];

let token = null;
for (const p of possiblePaths) {
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (data.token) { token = data.token; break; }
    if (data.tokens && data.tokens.length > 0) { token = data.tokens[0].token; break; }
  } catch {}
}

// Also check .vercel directory in project
try {
  const projAuth = path.join(__dirname, '.vercel', 'auth.json');
  const data = JSON.parse(fs.readFileSync(projAuth, 'utf8'));
  if (data.token) token = data.token;
} catch {}

if (!token) {
  console.log('TOKEN_NOT_FOUND');
  process.exit(0);
}

console.log('TOKEN_FOUND');

const projectId = 'prj_XwWNZKGyBFZlTxryrs2tYTLIjasy';
const baseUrl = 'https://api.vercel.com';

async function addEnvVar(key, value, target = ['production']) {
  const res = await fetch(`${baseUrl}/v9/projects/${projectId}/env`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      key,
      value,
      target,
      type: 'encrypted'
    })
  });
  const data = await res.json();
  console.log(`ENV ${key}: ${res.status} ${data.key || data.error?.message || JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Add JWT_SECRET
  await addEnvVar('JWT_SECRET', 'vkjUaxThHC20Qm4qoi5yIBFSc1pAJN8w');
  // Add SETUP_KEY  
  await addEnvVar('SETUP_KEY', '7imKg0MSOV9vEHqAt5hcbPxQ');
}

main().catch(e => console.error(e));

import crypto from 'crypto';
import { Pool } from 'pg';
import { spawn } from 'child_process';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL missing');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const derived = crypto.scryptSync(password, salt, 64).toString('hex'); return `${salt}:${derived}`; }
const env = { ...process.env, MOCK_UPSTREAM: 'false' };
const serverProc = spawn('npm', ['run', 'start'], { cwd: '/Users/liuzhiming/Desktop/aichat/server', env, stdio: ['ignore','pipe','pipe'] });
let ready = false;
serverProc.stdout.on('data', (d)=>{ if (d.toString().includes('Backend running at')) ready = true; });
serverProc.stderr.on('data', ()=>{});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
for (let i=0;i<240 && !ready;i++) await sleep(200);
if (!ready) throw new Error('server not ready');

let email = '';
let taskId = '';
try {
  email = `video_test_${Date.now()}@example.com`;
  const password = 'VideoTest#12345';
  await pool.query(`INSERT INTO users (id, full_name, email, role, avatar_url, preferences_json, password_hash, status, plan_name, monthly_credit_limit, credit_balance, credit_used, created_at, updated_at) VALUES ($1,$2,$3,'student',NULL,'{}'::jsonb,$4,'active','pro',20000,20000,0,NOW(),NOW())`, [crypto.randomUUID(), 'Video Test User', email, hashPassword(password)]);

  const login = await fetch('http://127.0.0.1:4000/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, password }) });
  if (!login.ok) throw new Error('login failed');
  const token = (await login.json()).token;

  const sourceImageUrl = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=512';
  const createTaskRes = await fetch('http://127.0.0.1:4000/api/video/studio-task', {
    method: 'POST', headers: { 'content-type':'application/json', authorization:`Bearer ${token}` },
    body: JSON.stringify({ sourceImageUrl, preset: 'big_movement', sourceAspectRatio: '9:16' })
  });
  const createTaskJson = await createTaskRes.json();
  if (!createTaskRes.ok) throw new Error(`create task failed: ${JSON.stringify(createTaskJson)}`);
  taskId = createTaskJson.task.id;

  const startRes = await fetch(`http://127.0.0.1:4000/api/video/studio-task/${taskId}/start`, {
    method: 'POST', headers: { 'content-type':'application/json', authorization:`Bearer ${token}` }, body: JSON.stringify({ testMode: false })
  });
  const startJson = await startRes.json();
  if (!startRes.ok) throw new Error(`start failed: ${JSON.stringify(startJson)}`);

  const pollStart = Date.now();
  let latest = null;
  while (Date.now() - pollStart < 8 * 60 * 1000) {
    await sleep(5000);
    const statusRes = await fetch(`http://127.0.0.1:4000/api/video/studio-task/${taskId}`, { headers: { authorization:`Bearer ${token}` } });
    latest = await statusRes.json();
    if (!statusRes.ok) throw new Error(`status failed: ${JSON.stringify(latest)}`);
    const s = latest?.task?.status;
    if (s === 'ready' || s === 'failed') break;
  }

  console.log(JSON.stringify({ taskId, final: latest?.task || null }, null, 2));
} finally {
  if (taskId) {
    await pool.query('DELETE FROM video_studio_tasks WHERE id=$1', [taskId]).catch(()=>{});
  }
  if (email) {
    await pool.query('DELETE FROM users WHERE email=$1', [email]).catch(()=>{});
  }
  await pool.end().catch(()=>{});
  serverProc.kill('SIGTERM');
}

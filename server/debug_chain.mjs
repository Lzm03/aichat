import crypto from 'crypto';
import { Pool } from 'pg';
import { spawn } from 'child_process';

const DB = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const derived=crypto.scryptSync(password,salt,64).toString('hex');return `${salt}:${derived}`;}

const env = { ...process.env, MOCK_UPSTREAM: 'true', MOCK_UPSTREAM_MIN_DELAY_MS: '100', MOCK_UPSTREAM_MAX_DELAY_MS: '300', MOCK_UPSTREAM_FAILURE_RATE: '0', LOG_LEVEL: 'debug' };
const sp = spawn('npm',['run','start'],{cwd:'/Users/liuzhiming/Desktop/aichat/server',env,stdio:['ignore','pipe','pipe']});
let ready=false; let out=''; let err='';
sp.stdout.on('data',d=>{ const t=d.toString(); out += t; if(t.includes('Backend running at')) ready=true; });
sp.stderr.on('data',d=>{ err += d.toString(); });
for (let i=0;i<240 && !ready;i++) await sleep(250);
if(!ready) throw new Error('server not ready');

let email='';
try {
  email=`debug_${Date.now()}@example.com`; const pwd='Suite#12345';
  await pool.query(`INSERT INTO users (id,full_name,email,role,avatar_url,preferences_json,password_hash,status,plan_name,monthly_credit_limit,credit_balance,credit_used,created_at,updated_at) VALUES ($1,$2,$3,'student',NULL,'{}'::jsonb,$4,'active','pro',30000,30000,0,NOW(),NOW())`, [crypto.randomUUID(),'Debug User',email,hashPassword(pwd)]);

  const login=await fetch('http://127.0.0.1:4000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pwd})});
  const loginText = await login.text();
  console.log('login status', login.status, loginText.slice(0,200));
  console.log('server out tail', out.slice(-1000));
  console.log('server err tail', err.slice(-1000));
} finally {
  if(email) await pool.query('DELETE FROM users WHERE email=$1',[email]).catch(()=>{});
  await pool.end().catch(()=>{});
  sp.kill('SIGTERM');
}

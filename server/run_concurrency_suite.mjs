import crypto from 'crypto';
import { Pool } from 'pg';
import { spawn } from 'child_process';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL missing');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const derived = crypto.scryptSync(password, salt, 64).toString('hex'); return `${salt}:${derived}`; }

const env = { ...process.env, MOCK_UPSTREAM: 'true', MOCK_UPSTREAM_MIN_DELAY_MS: '300', MOCK_UPSTREAM_MAX_DELAY_MS: '2500', MOCK_UPSTREAM_FAILURE_RATE: '0.03' };
const serverProc = spawn('npm', ['run', 'start'], { cwd: '/Users/liuzhiming/Desktop/aichat/server', env, stdio: ['ignore','pipe','pipe'] });
let ready = false;
serverProc.stdout.on('data', (d)=>{ if (d.toString().includes('Backend running at')) ready = true; });
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const waitReady = async ()=>{ for(let i=0;i<240;i++){ if(ready) return; await sleep(200);} throw new Error('server not ready'); };

const runLoad = async ({name, concurrency, total, task}) => { let ok=0, fail=0; const lat=[]; let idx=0; const worker=async()=>{ while(true){ const i=idx++; if(i>=total) return; const t0=performance.now(); try{ await task(i); lat.push(performance.now()-t0); ok++; }catch{ fail++; } } }; const s=performance.now(); await Promise.all(Array.from({length:concurrency},worker)); const d=(performance.now()-s)/1000; lat.sort((a,b)=>a-b); const p=x=>lat[Math.min(lat.length-1,Math.floor(lat.length*x))]||0; return {name,concurrency,total,ok,fail,error_rate:+((fail/total)*100).toFixed(2),rps:+(total/d).toFixed(2),p50_ms:+p(0.5).toFixed(2),p95_ms:+p(0.95).toFixed(2),p99_ms:+p(0.99).toFixed(2)}; };

let createdEmail='';
try {
  const email = `loadtest_${Date.now()}@example.com`; createdEmail = email;
  const password = 'Loadtest#12345';
  await pool.query(`INSERT INTO users (id, full_name, email, role, avatar_url, preferences_json, password_hash, status, plan_name, monthly_credit_limit, credit_balance, credit_used, created_at, updated_at) VALUES ($1,$2,$3,'student',NULL,'{}'::jsonb,$4,'active','starter',200,200,0,NOW(),NOW()) ON CONFLICT (email) DO NOTHING`, [crypto.randomUUID(), 'Load Test User', email, hashPassword(password)]);

  await waitReady();
  const loginSuite = await runLoad({name:'auth_login',concurrency:100,total:1500,task:async()=>{ const r=await fetch('http://127.0.0.1:4000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})}); if(!r.ok) throw new Error(); await r.arrayBuffer(); }});
  const login = await fetch('http://127.0.0.1:4000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  const token = (await login.json()).token;
  const meSuite = await runLoad({name:'auth_me',concurrency:100,total:2500,task:async()=>{ const r=await fetch('http://127.0.0.1:4000/api/auth/me',{headers:{authorization:`Bearer ${token}`}}); if(!r.ok) throw new Error(); await r.arrayBuffer(); }});
  const askSuite = await runLoad({name:'ask_mock_upstream',concurrency:100,total:1000,task:async(i)=>{ const r=await fetch('http://127.0.0.1:4000/api/ask',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({systemPrompt:'你是老师',userPrompt:`并发请求${i}`,stream:false,usageType:'chat_message',botId:'default',modelProvider:'deepseek'})}); if(!r.ok) throw new Error(); await r.arrayBuffer(); }});
  console.log(JSON.stringify({results:[loginSuite, meSuite, askSuite]}, null, 2));
} finally {
  if (createdEmail) await pool.query('DELETE FROM users WHERE email=$1', [createdEmail]).catch(()=>{});
  await pool.end().catch(()=>{});
  serverProc.kill('SIGTERM');
}

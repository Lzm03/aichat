import crypto from 'crypto';
import { Pool } from 'pg';
import { spawn } from 'child_process';

const DB = process.env.DATABASE_URL;
if (!DB) throw new Error('DATABASE_URL missing');
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const derived=crypto.scryptSync(password,salt,64).toString('hex');return `${salt}:${derived}`;}

async function runLoad(name, concurrency, total, task){
  let ok=0, fail=0; const lat=[]; let i=0;
  const w=async()=>{while(true){const n=i++; if(n>=total) return; const t0=performance.now(); try{await task(n); lat.push(performance.now()-t0); ok++;}catch{fail++;}}};
  const s=performance.now(); await Promise.all(Array.from({length:concurrency},w)); const d=(performance.now()-s)/1000;
  lat.sort((a,b)=>a-b); const p=x=>lat[Math.min(lat.length-1, Math.floor(lat.length*x))]||0;
  return {name, concurrency, total, ok, fail, error_rate:+((fail/total)*100).toFixed(2), rps:+(total/d).toFixed(2), p50_ms:+p(0.5).toFixed(2), p95_ms:+p(0.95).toFixed(2), p99_ms:+p(0.99).toFixed(2)};
}

const serverEnv = { ...process.env, MOCK_UPSTREAM: 'true', MOCK_UPSTREAM_MIN_DELAY_MS: '300', MOCK_UPSTREAM_MAX_DELAY_MS: '2000', MOCK_UPSTREAM_FAILURE_RATE: '0.02' };
const sp = spawn('npm',['run','start'],{cwd:'/Users/liuzhiming/Desktop/aichat/server',env:serverEnv,stdio:['ignore','pipe','pipe']});
let ready=false; sp.stdout.on('data',d=>{if(d.toString().includes('Backend running at')) ready=true;});
for(let t=0;t<240 && !ready;t++) await sleep(250);
if(!ready) throw new Error('server not ready');

let email=''; let uid='';
try{
  email=`suite_${Date.now()}@example.com`; uid=crypto.randomUUID(); const pwd='Suite#12345';
  await pool.query(`INSERT INTO users (id,full_name,email,role,avatar_url,preferences_json,password_hash,status,plan_name,monthly_credit_limit,credit_balance,credit_used,created_at,updated_at) VALUES ($1,$2,$3,'student',NULL,'{}'::jsonb,$4,'active','pro',30000,30000,0,NOW(),NOW())`,[uid,'Suite User',email,hashPassword(pwd)]);

  const loginOnce = await fetch('http://127.0.0.1:4000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pwd})});
  const token = (await loginOnce.json()).token;

  const r1=await runLoad('auth_login',100,1000,async()=>{const r=await fetch('http://127.0.0.1:4000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pwd})}); if(!r.ok) throw 1; await r.arrayBuffer();});
  const r2=await runLoad('auth_me',100,1500,async()=>{const r=await fetch('http://127.0.0.1:4000/api/auth/me',{headers:{authorization:`Bearer ${token}`}}); if(!r.ok) throw 1; await r.arrayBuffer();});
  const r3=await runLoad('ask_mock',100,600,async(i)=>{const r=await fetch('http://127.0.0.1:4000/api/ask',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({systemPrompt:'你是老师',userPrompt:`Q${i}`,stream:false,usageType:'general',botId:'default',modelProvider:'deepseek'})}); if(!r.ok) throw 1; await r.arrayBuffer();});
  const r4=await runLoad('tts_mock',30,120,async(i)=>{const r=await fetch('http://127.0.0.1:4000/api/tts',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({text:`hello ${i}`,voiceId:'mock-voice-1',usageType:'chat_voice'})}); if(!r.ok) throw 1; await r.arrayBuffer();});
  const r5=await runLoad('ask_url_mock',40,120,async(i)=>{const r=await fetch('http://127.0.0.1:4000/api/ask-url',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({systemPrompt:'总结',url:'https://example.com',modelProvider:'deepseek'})}); if(!r.ok) throw 1; await r.arrayBuffer();});

  console.log(JSON.stringify({mode:'mock_suite',results:[r1,r2,r3,r4,r5]},null,2));
}catch(e){console.error(e); process.exitCode=1;}
finally{ if(email) await pool.query('DELETE FROM users WHERE email=$1',[email]).catch(()=>{}); await pool.end().catch(()=>{}); sp.kill('SIGTERM'); }

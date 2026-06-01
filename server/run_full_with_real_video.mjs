import { spawn } from 'child_process';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

const env={...process.env,MOCK_UPSTREAM:'true',MOCK_UPSTREAM_MIN_DELAY_MS:'200',MOCK_UPSTREAM_MAX_DELAY_MS:'1200',MOCK_UPSTREAM_FAILURE_RATE:'0.02'};
const sp=spawn('npm',['run','start'],{cwd:'/Users/liuzhiming/Desktop/aichat/server',env,stdio:['ignore','pipe','pipe']});
let ready=false; let logs='';
sp.stdout.on('data',d=>{const t=d.toString(); logs+=t; if(t.includes('Backend running at')) ready=true;});
for(let i=0;i<240 && !ready;i++) await sleep(250);
if(!ready) throw new Error('server not ready');

async function runLoad(name,concurrency,total,task){let ok=0,fail=0;const lat=[];let i=0;const w=async()=>{for(;;){const n=i++;if(n>=total)return;const t0=performance.now();try{await task(n);lat.push(performance.now()-t0);ok++;}catch{fail++;}}};const s=performance.now();await Promise.all(Array.from({length:concurrency},w));const d=(performance.now()-s)/1000;lat.sort((a,b)=>a-b);const p=x=>lat[Math.min(lat.length-1,Math.floor(lat.length*x))]||0;return {name,concurrency,total,ok,fail,error_rate:+((fail/total)*100).toFixed(2),rps:+(total/d).toFixed(2),p95_ms:+p(0.95).toFixed(2),p99_ms:+p(0.99).toFixed(2)};}

try{
  const email='lzm200303@gmail.com'; const password='Uzumymw123';
  const login=await fetch('http://127.0.0.1:4000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  const loginJson=await login.json();
  if(!login.ok||!loginJson.token) throw new Error('login failed '+JSON.stringify(loginJson));
  const token=loginJson.token;

  const low=[];
  const me=await fetch('http://127.0.0.1:4000/api/auth/me',{headers:{authorization:`Bearer ${token}`}}); low.push({api:'me',status:me.status});
  const voices=await fetch('http://127.0.0.1:4000/api/voices'); low.push({api:'voices',status:voices.status});
  const ask=await fetch('http://127.0.0.1:4000/api/ask',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({systemPrompt:'你是老师',userPrompt:'测试',stream:false,usageType:'general',botId:'default',modelProvider:'deepseek'})}); low.push({api:'ask',status:ask.status});
  const tts=await fetch('http://127.0.0.1:4000/api/tts',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({text:'hello',voiceId:'mock-voice-1',usageType:'chat_voice'})}); low.push({api:'tts',status:tts.status});
  const askUrl=await fetch('http://127.0.0.1:4000/api/ask-url',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({systemPrompt:'总结',url:'https://example.com',modelProvider:'deepseek'})}); low.push({api:'ask-url',status:askUrl.status});

  const r1=await runLoad('auth_me',100,1200,async()=>{const r=await fetch('http://127.0.0.1:4000/api/auth/me',{headers:{authorization:`Bearer ${token}`}}); if(!r.ok) throw 1; await r.arrayBuffer();});
  const r2=await runLoad('ask_mock',100,600,async(i)=>{const r=await fetch('http://127.0.0.1:4000/api/ask',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({systemPrompt:'你是老师',userPrompt:`Q${i}`,stream:false,usageType:'general',botId:'default',modelProvider:'deepseek'})}); if(!r.ok) throw 1; await r.arrayBuffer();});
  const r3=await runLoad('tts_mock',30,120,async(i)=>{const r=await fetch('http://127.0.0.1:4000/api/tts',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({text:`hello ${i}`,voiceId:'mock-voice-1',usageType:'chat_voice'})}); if(!r.ok) throw 1; await r.arrayBuffer();});

  console.log(JSON.stringify({phase:'mock_suite',low,r:[r1,r2,r3]},null,2));

  // Real video + remove bg smoke (turn off mock via direct APIs unaffected, but here endpoints real in runner)
  const sourceImageUrl='https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=512';
  const create=await fetch('http://127.0.0.1:4000/api/video/studio-task',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({sourceImageUrl,preset:'big_movement',sourceAspectRatio:'9:16'})});
  const cjson=await create.json();
  if(!create.ok) throw new Error('create task fail '+JSON.stringify(cjson));
  const taskId=cjson.task.id;
  const start=await fetch(`http://127.0.0.1:4000/api/video/studio-task/${taskId}/start`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({testMode:false})});
  const sjson=await start.json();
  if(!start.ok) throw new Error('start task fail '+JSON.stringify(sjson));
  let final=sjson.task; const began=Date.now();
  while(Date.now()-began<7*60*1000){await sleep(5000);const st=await fetch(`http://127.0.0.1:4000/api/video/studio-task/${taskId}`,{headers:{authorization:`Bearer ${token}`}}); const j=await st.json(); if(st.ok){final=j.task; if(['ready','failed'].includes(final.status)) break;}}
  console.log(JSON.stringify({phase:'real_video_smoke',taskId,status:final?.status,slots:final?.slots||null},null,2));

}catch(e){console.error(String(e?.stack||e)); process.exitCode=1;}
finally{sp.kill('SIGTERM');}

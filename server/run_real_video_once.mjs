import { spawn } from 'child_process';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const env={...process.env,MOCK_UPSTREAM:'false'};
const sp=spawn('npm',['run','start'],{cwd:'/Users/liuzhiming/Desktop/aichat/server',env,stdio:['ignore','pipe','pipe']});
let ready=false; let out=''; let err='';
sp.stdout.on('data',d=>{const t=d.toString(); out+=t; if(t.includes('Backend running at')) ready=true;});
sp.stderr.on('data',d=>{err+=d.toString();});
for(let i=0;i<240 && !ready;i++) await sleep(250);
if(!ready) throw new Error('server not ready');

try{
  const login=await fetch('http://127.0.0.1:4000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'lzm200303@gmail.com',password:'Uzumymw123'})});
  const lj=await login.json();
  if(!login.ok||!lj.token) throw new Error('login failed '+JSON.stringify(lj));
  const token=lj.token;
  const create=await fetch('http://127.0.0.1:4000/api/video/studio-task',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({sourceImageUrl:'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=512',preset:'big_movement',sourceAspectRatio:'9:16'})});
  const cj=await create.json();
  if(!create.ok) throw new Error('create failed '+JSON.stringify(cj));
  const taskId=cj.task.id;
  const start=await fetch(`http://127.0.0.1:4000/api/video/studio-task/${taskId}/start`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({testMode:false})});
  const sj=await start.json();
  if(!start.ok) throw new Error('start failed '+JSON.stringify(sj));
  let final=sj.task;
  const began=Date.now();
  while(Date.now()-began<8*60*1000){
    await sleep(5000);
    const st=await fetch(`http://127.0.0.1:4000/api/video/studio-task/${taskId}`,{headers:{authorization:`Bearer ${token}`}});
    const j=await st.json();
    if(st.ok){final=j.task; if(['ready','failed'].includes(final.status)) break;}
  }
  console.log(JSON.stringify({taskId,status:final?.status,slots:final?.slots},null,2));
}catch(e){
  console.log('ERROR',String(e?.stack||e));
}
console.log('OUT_TAIL',out.slice(-3000));
console.log('ERR_TAIL',err.slice(-3000));
sp.kill('SIGTERM');

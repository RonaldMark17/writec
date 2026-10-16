// Measure rendered text against composited CSS backgrounds (not image pixels).
// Usage: node scripts/audit-theme-contrast.cjs fixtures output [quick]
const fs=require('fs'),path=require('path'),os=require('os');
const {spawn}=require('child_process');
const {createHash}=require('crypto');
const fixtures=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
fs.mkdirSync(output,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'wc-contrast-'));
const browser=spawn(process.env.CHROME_BINARY||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
function audit() {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
 const blend=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1);
 const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[aria-hidden="true"],.sr-only');
 const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(visible),scope=dialogs.at(-1)||document.body;
 const failures=[],manual=[];let checked=0;
 for(const el of scope.querySelectorAll('*')) {
  if(!visible(el)||el.closest('svg,canvas,script,style,iframe'))continue;
  const text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const input=el.matches('input:not([type=checkbox]):not([type=radio]),textarea,select');
  if(!text&&!input)continue;
  const s=getComputedStyle(el);let chain=[],node=el;
  while(node){chain.unshift(node);node=node.parentElement;}
  if(chain.some(n=>getComputedStyle(n).opacity==='0'))continue;
  let bg=[255,255,255,1],alpha=1,gradient=false,stops=[];
  for(const n of chain){const st=getComputedStyle(n);bg=blend(rgba(st.backgroundColor),bg);alpha*=Number(st.opacity);if(st.backgroundImage!=='none'){gradient=true;stops=st.backgroundImage.match(/rgba?\([^)]*\)/g)||[];}}
  const items=[{label:text||el.value||'Input text',color:s.color,kind:'text'}];
  if(el.placeholder){const p=getComputedStyle(el,'::placeholder');items.push({label:el.placeholder,color:p.color,opacity:Number(p.opacity),kind:'placeholder'});}
  for(const item of items){
   const fg=rgba(item.color);fg[3]*=alpha*(item.opacity??1);
   const value=ratio(blend(fg,bg),bg);const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700),limit=large?3:4.5;
   checked++;const record={label:item.label.slice(0,90),kind:item.kind,tag:el.tagName,class:el.className,color:item.color,background:bg.slice(0,3),opacity:alpha,ratio:+value.toFixed(2),limit,disabled:!!el.closest(':disabled')};
   if(gradient&&stops.length){record.gradientRatios=stops.map(stop=>{const surface=blend(rgba(stop),bg);return +ratio(blend(fg,surface),surface).toFixed(2);});record.ratio=Math.min(...record.gradientRatios);if(record.ratio<limit-.03)failures.push(record);}else if(gradient)manual.push(record);else if(value<limit-.03)failures.push(record);
  }
 }
 return {checked,failures,manual,overflow:document.documentElement.scrollWidth>innerWidth};
}
(async()=>{
 let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await sleep(100);}
 if(!port)throw Error('Browser did not start');
 const target=await(await fetch(`http://localhost:${port}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
 let id=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(m.error):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;const timer=setTimeout(()=>{pending.delete(requestId);reject(Error(`Browser timed out during ${method}`));},20000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('DOM.enable');await send('CSS.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
 const css=fs.readdirSync('build/static/css').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join('build/static/css',f),'utf8').replace(/@import\s+(?:url\([^)]*\)|"[^"]*"|\x27[^\x27]*\x27)\s*;/g,'')).join('\n');
 let results=[];const quick=process.argv[4]==='quick';const widths=quick?[[390,844],[1366,768]]:[[360,800],[390,844],[430,932],[768,1024],[1366,768],[1920,1080]];
 const files=fs.readdirSync(fixtures).filter(f=>f.endsWith('.body.html'));
 const signature=createHash('sha256').update(css+JSON.stringify(widths)+fs.readFileSync(__filename,'utf8')+files.map(f=>fs.readFileSync(path.join(fixtures,f),'utf8')).join('')).digest('hex');
 const checkpoint=path.join(output,'checkpoint.json');
 if(process.env.WC_AUDIT_RESUME&&fs.existsSync(checkpoint)){const saved=JSON.parse(fs.readFileSync(checkpoint));if(saved.signature===signature)results=saved.results;}
 fs.writeFileSync(path.join(output,'run-info.json'),JSON.stringify({status:'running',signature,fixtures:files.length}));
 for(const file of files){
  const name=file.replace('.body.html','');
  if(results.filter(r=>r.name===name).length===widths.length*2*4){console.log(`Verified checkpoint ${name}`);continue;}
  const html=fs.readFileSync(path.join(fixtures,file),'utf8').replace(/(<iframe[^>]*\bsrc=)["'][^"']*["']/g,'$1"about:blank"');
  for(const theme of ['light','dark'])for(const [width,height]of widths){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});const {frameTree}=await send('Page.getFrameTree');
   await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<!doctype html><html data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} *{animation:none!important;transition:none!important}</style></head><body>${html}</body></html>`});
   // Fixtures from Startup capture inline palette variables; switch those as the real theme hook does.
   await evaluate(`(()=>{const page=document.querySelector('.landing-page');if(page&&'${theme}'==='dark')Object.entries(${JSON.stringify(require('../src/darkPalette.json'))}).forEach(([k,v])=>page.style.setProperty(k,v));})()`);
   for(const state of ['default','expanded','hover','focus-visible']){
    if(state==='expanded') await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
    if(['hover','focus-visible'].includes(state)){
     const {root}=await send('DOM.getDocument');const {nodeIds}=await send('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'button,a,input,select,textarea,summary,[role="tab"],tr,.group'});
     await Promise.all(nodeIds.map(nodeId=>send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[state]})));
    }
    results.push({name,theme,width,height,state,...await evaluate(`(${audit.toString()})()`)});
   }
   if(!quick&&[390,1366].includes(width)){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`${name}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}
  }
  fs.writeFileSync(checkpoint,JSON.stringify({signature,results}));
  console.log(`Audited ${name}`);
 }
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
 const issues=results.flatMap(r=>r.failures.map(f=>({name:r.name,theme:r.theme,width:r.width,state:r.state,...f})));
 fs.writeFileSync(path.join(output,'issues.json'),JSON.stringify(issues,null,2));
 console.log(`${results.length} views/states; ${results.reduce((n,r)=>n+r.checked,0)} text checks; ${issues.length} flagged occurrences (${new Set(issues.map(i=>[i.theme,i.class,i.color,i.ratio,i.label].join('|'))).size} distinct).`);
 fs.writeFileSync(path.join(output,'run-info.json'),JSON.stringify({status:'complete',signature,fixtures:files.length,states:results.length,issues:issues.length}));
 if(issues.length)process.exitCode=1;
 await send('Browser.close');socket.close();
})().catch(e=>{console.error(e);socket?.close();browser.kill();process.exitCode=1;});

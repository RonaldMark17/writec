const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const {spawn} = require('child_process');
const output = path.resolve('artifacts/landing'); fs.mkdirSync(output, {recursive:true});
const root = path.resolve('build');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  let file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root)) {res.writeHead(403);res.end();return;}
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');fs.createReadStream(file).pipe(res);
});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let browser, socket;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url = `http://127.0.0.1:${server.address().port}`;
 const profile = fs.mkdtempSync(path.join(os.tmpdir(),'wc-landing-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port; for(let i=0;i<150;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await sleep(100);}
 if(!port)throw Error('Browser did not start');
 const target=await(await fetch(`http://localhost:${port}/json/new?about:blank`,{method:'PUT'})).json();
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
 let id=0;const pending=new Map();const errors=[],requests=[];
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Page.navigate',{url});
 for(let i=0;i<200;i++){if(await evaluate('!!document.querySelector(".landing-demo")'))break;await sleep(100);}
 if(!await evaluate('!!document.querySelector(".landing-demo")'))throw Error('Landing not rendered');
 const checks=[];
 for(const theme of ['light','dark'])for(const [width,height] of [[360,800],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1920,1080]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
  await evaluate(`localStorage.setItem('writecheck-theme','${theme}');window.dispatchEvent(new Event('storage'));window.scrollTo({top:0,behavior:'instant'})`);await sleep(350);
  checks.push({theme,width,height,...await evaluate(`(()=>({overflow:document.documentElement.scrollWidth>innerWidth,themeControls:[...document.querySelectorAll('button')].filter(b=>/Switch.*(theme|mode)/.test(b.getAttribute('aria-label')||'')).length,navOverflow:document.querySelector('header').scrollWidth>innerWidth}))()`) });
  if(width===360||width===1366){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,`landing-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));}
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`document.querySelector('.sample-chips button').click();document.querySelector('#demo').scrollIntoView({behavior:'instant'})`);await sleep(150);
 const before=requests.length;
 await evaluate(`document.querySelector('.demo-run').click()`);await sleep(250);
 const result=await evaluate(`({result:!!document.querySelector('.demo-result mark'),complete:document.querySelectorAll('.is-complete').length,used:localStorage.getItem('writecheck-guest-demo-v1'),disabled:document.querySelector('.demo-run').disabled,overflow:document.documentElement.scrollWidth>innerWidth})`);
 const demoRequests=requests.slice(before).filter(u=>!u.startsWith(url));
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(output,'demo-dark-mobile.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('#demo-tab-text').click()`);
 const textIsolation=await evaluate(`!document.querySelector('.demo-attachment')&&!document.querySelector('.demo-dropzone')&&!!document.querySelector('textarea')`);
 await evaluate(`document.querySelector('#features').scrollIntoView({behavior:'instant'})`);await sleep(200);
 const scrollSpy=await evaluate(`document.querySelector('nav a[href="#features"]').getAttribute('aria-current')`);
 const report={checks,result,demoRequests,textIsolation,scrollSpy,errors};
 fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 if(checks.some(c=>c.overflow||c.navOverflow||c.themeControls!==1)||!result.result||result.complete!==4||result.overflow||demoRequests.length||!textIsolation||scrollSpy!=='location'||errors.length)throw Error('Browser assertions failed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();server.close();});

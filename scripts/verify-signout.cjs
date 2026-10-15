/* Browser layout audit of real component fixtures exported by src/responsive.test.js.
   Usage: node scripts/verify-responsive.cjs <fixture-directory> [output-directory]
   Requires Node with built-in WebSocket and local Chromium/Edge (CHROME_BINARY override).
   Fixtures use mocked services; this does not exercise a live backend. */
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const fixtureDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'writecheck-responsive'));
const output = path.resolve(process.argv[3] || path.join(fixtureDir, 'audit'));
fs.mkdirSync(output, { recursive: true });
const binary = process.env.CHROME_BINARY || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'writecheck-browser-'));
const browser = spawn(binary, ['--headless', '--disable-gpu', '--no-first-run', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const viewports = [[1366,768],[390,844],[360,430]];
let socket;
(async () => {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {}
    await sleep(100);
  }
  if (!port) throw new Error('Browser debugging endpoint did not start.');
  const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  const pending = new Map(); let id = 0;
  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(message.error) : item.resolve(message.result); } };
  const send = (method, params = {}) => new Promise((resolve,reject) => { pending.set(++id,{resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
  const cssFile = fs.readdirSync('build/static/css').find(name => name.endsWith('.css'));
  const css = fs.readFileSync(path.join('build/static/css',cssFile),'utf8').replace(/@import[^;]+;/g,'');
  // Append current responsive source so a focused CSS fix can be checked before rebuilding.
  const responsive = fs.readFileSync('src/responsive.css','utf8');
  const fixtures = fs.readdirSync(fixtureDir).filter(name => ['student-classes','teacher-classes','admin-approvals','student-menu','teacher-menu','admin-menu','profile-identity','signout-confirmation'].some(key => name === key+'.body.html'));
  const results = [], keyboardChecks = [];
  await send('Page.enable');
  for (const file of fixtures) {
    const name = file.replace('.body.html','');
    let markup = fs.readFileSync(path.join(fixtureDir,file),'utf8');
    markup = markup.replace(/src="https?:[^\"]*"/g,'src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E"');
    for (const theme of ['light','dark']) for (const [width,height] of viewports) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});
      const {frameTree} = await send('Page.getFrameTree');
      await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<!doctype html><html data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${responsive}</style></head><body>${markup}</body></html>`});
      await sleep(250); // Allow drawer entrance animation to settle before measuring.
      const evaluated = await send('Runtime.evaluate',{expression:`(()=>{
        const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
        const overflowing=[...document.querySelectorAll('main,header,.wc-modal-panel,.wc-classroom-grid,.wc-data-row,.wc-navigation,input,select,textarea,button,.notification-panel,.wc-drawer')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1}).map(e=>({tag:e.tagName,label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,60),class:e.className}));
        const panel=document.querySelector('.wc-modal-panel'); const p=panel?.getBoundingClientRect();
        return {pageOverflow:document.documentElement.scrollWidth>innerWidth,overflowing,modalFits:!p||(p.height<=innerHeight+1&&p.width<=innerWidth+1),cards:document.querySelector('.wc-data-row')?getComputedStyle(document.querySelector('.wc-data-row')).gridTemplateColumns:null,table:document.querySelector('.wc-card-table')?getComputedStyle(document.querySelector('.wc-card-table')).display:null,marks:document.querySelectorAll('mark').length,smallButtons:innerWidth<768?[...document.querySelectorAll('button')].filter(visible).filter(e=>e.getBoundingClientRect().height<40).length:0};
      })()`,returnByValue:true});
      results.push({name,theme,width,height,...evaluated.result.value});
      await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9});
      await send('Input.dispatchKeyEvent', {type:'keyUp', key:'Tab', code:'Tab', windowsVirtualKeyCode:9});
      const controls = await send('Runtime.evaluate', {expression:`(() => {
        return [...document.querySelectorAll('.account-signout')].filter(e=>e.getClientRects().length).map(e=>{
          e.scrollIntoView({block:'center'}); e.focus();
          const r=e.getBoundingClientRect(), style=getComputedStyle(e);
          return {height:r.height,visible:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,focus:style.outlineStyle,color:style.color,background:style.backgroundColor,icon:!!e.querySelector('svg[aria-hidden="true"]')};
        });
      })()`,returnByValue:true});
      results[results.length-1].signout = controls.result.value;
      if (controls.result.value.some(c=>c.height<44||!c.visible||c.focus==='none'||!c.icon)) throw new Error('Sign out is not reachable/accessible: '+JSON.stringify(controls.result.value));
      if (width===390 || width===1366) {
        const shot=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(output,`${name}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      if (width===390 && ['teacher-grading','highlighted-review'].includes(name)) {
        await send('Runtime.evaluate',{expression:`document.querySelector('#review-grading')?.scrollIntoView({block:'center',behavior:'instant'})`});
        const shot=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(output,`${name}-${theme}-grading.png`),Buffer.from(shot.data,'base64'));
      }
      if (width===390 && ['profile','contact','teacher-grading','create-assignment'].includes(name)) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:430,deviceScaleFactor:1,mobile:true});
        const focused=await send('Runtime.evaluate',{expression:`new Promise(resolve=>{
          const field=[...document.querySelectorAll('textarea,input:not([type="hidden"]):not([type="file"])')].find(e=>e.getClientRects().length);
          field?.focus();field?.scrollIntoView({block:'center',behavior:'instant'});
          requestAnimationFrame(()=>{const r=field?.getBoundingClientRect();resolve({fieldVisible:!!r&&r.top>=0&&r.bottom<=innerHeight+1,viewportHeight:innerHeight})});
        })`,returnByValue:true,awaitPromise:true});
        keyboardChecks.push({name,theme,...focused.result.value});
        const shot=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(output,`${name}-${theme}-reduced-height.png`),Buffer.from(shot.data,'base64'));
      }
    }
    console.log(`Checked ${name}: 3 viewports, both themes`);
  }
  // Approximate a reduced visual viewport with keyboard open; real device IME still needs validation.
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({viewports,results,keyboardChecks,keyboardNote:'Reduced viewport checks approximate keyboard space. Hardware/IME not simulated.'},null,2));
  const failed=results.filter(r=>r.pageOverflow||r.overflowing.length||!r.modalFits);
  fs.writeFileSync(path.join(output,'issues.json'),JSON.stringify(failed,null,2));
  if (failed.length || keyboardChecks.some(check => !check.fieldVisible)) process.exitCode=1;
  console.log(`${results.length} layout checks; ${failed.length} needing review. Artifacts: ${output}`);
  await send('Browser.close'); socket.close();
})().catch(error=>{ console.error(error); socket?.close(); browser.kill(); process.exitCode=1; });

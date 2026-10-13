// Check the actual rename modal and shared validation in Edge without backend writes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const webpack = require('webpack');
const root = path.resolve(__dirname, '..');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'writecheck-validation-'));
const entry = path.join(folder, 'entry.js');
const noop = path.join(folder, 'noop.js');
fs.writeFileSync(noop, 'exports.getBackendUrl = () => "http://invalid.test"; exports.apiFetch = () => { window.requests++; throw Error("Unexpected request"); };');
fs.writeFileSync(entry, `
const React = require(${JSON.stringify(require.resolve('react'))});
const {createRoot} = require(${JSON.stringify(require.resolve('react-dom/client'))});
const {flushSync} = require(${JSON.stringify(require.resolve('react-dom'))});
const Rename = require(${JSON.stringify(path.join(root, 'src/pages/dashboard/RenameClassroom.js'))}).default;
const mode = new URLSearchParams(location.search).get('theme') || 'light';
document.documentElement.dataset.theme = mode;
window.requests = 0;
const root = createRoot(document.getElementById('app'));
const check = (ok,msg) => { if(!ok) throw Error(msg); };
try {
 flushSync(()=>root.render(React.createElement(Rename,{classroom:{id:'test',name:'CSST 106'},onClose:()=>{},onRenamed:()=>{}})));
 const input = document.querySelector('input');
 const save = document.querySelector('button[type=submit]');
 check(input.value==='CSST 106' && save.disabled,'Prefill or unchanged guard missing');
 const change = value => flushSync(()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 change('   ');flushSync(()=>save.click());
 let error = document.querySelector('[role=alert]');
 check(error && error.textContent==='Classroom name is required.','Missing field error');
 check(input.getAttribute('aria-invalid')==='true','Missing invalid state');
 check(input.getAttribute('aria-describedby')===error.id,'Missing description');
 check(document.activeElement===input,'Missing focus');
 const computed = getComputedStyle(error), style={color:computed.color,backgroundColor:computed.backgroundColor}, border=getComputedStyle(input).borderColor;
 check(style.color===(mode==='dark'?'rgb(242, 184, 181)':'rgb(166, 28, 24)'), 'Wrong error color '+style.color);
 check(border===style.color,'Error border does not match theme');
 change('CSST 106 - Updated');
 check(!document.querySelector('[role=alert]'),'Stale error after correction');
 change('');flushSync(()=>save.click());
 check(window.requests===0,'Invalid form sent request');
 document.getElementById('results').textContent=JSON.stringify({ok:true,theme:mode,color:style.color,background:style.backgroundColor,border,requests:window.requests});
} catch(error) {document.getElementById('results').textContent=JSON.stringify({ok:false,error:error.message,stack:error.stack});}
`);
webpack({mode:'development',devtool:false,entry,output:{path:folder,filename:'report.js'},
  resolve:{modules:[path.join(root,'node_modules'),'node_modules'],extensions:['.js','.json']},
  module:{rules:[{test:/\.js$/,include:path.join(root,'src'),use:{loader:require.resolve('babel-loader'),options:{
    babelrc:false,configFile:false,presets:[[require.resolve('@babel/preset-react'),{runtime:'automatic'}]]}}}]},
  plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})}),
    new webpack.NormalModuleReplacementPlugin(/apiFetch$/,noop)]
},(error,stats)=>{
  if(error || stats.hasErrors()) throw error || Error(stats.toString({all:false,errors:true}));
  const css = Object.values(require('../build/asset-manifest.json').files).find(f=>f.endsWith('.css'));
  assert.ok(css,'Run npm run build before browser verification');
  const html=path.join(folder,'report.html');
  fs.writeFileSync(html,`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root,'build',css.replace(/^\//,''))).href}"></head><body><div id="app"></div><pre id="results" hidden></pre><script src="report.js"></script></body></html>`);
  for(const theme of ['light','dark']) {
    const screenshot=path.join(folder,`${theme}.png`);
    const run=spawnSync(process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ['--headless','--disable-gpu','--no-first-run','--allow-file-access-from-files','--window-size=1440,1050',
        `--user-data-dir=${path.join(folder,'browser-'+theme)}`,'--virtual-time-budget=2500','--dump-dom',
        `--screenshot=${screenshot}`,pathToFileURL(html).href+'?theme='+theme],
      {encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});
    if(run.error) throw run.error;
    const match=run.stdout.match(/<pre id="results" hidden="">([^<]+)<\/pre>/);
    assert.ok(match,run.stderr+'\nNo browser result');
    const outcome=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));
    assert.equal(outcome.ok,true,JSON.stringify(outcome));
    const artifacts=path.join(root,'artifacts','classroom-validation');
    fs.mkdirSync(artifacts,{recursive:true});
    fs.copyFileSync(screenshot,path.join(artifacts,theme+'.png'));
    console.log(JSON.stringify({...outcome,screenshot:path.join(artifacts,theme+'.png')}));
  }
});

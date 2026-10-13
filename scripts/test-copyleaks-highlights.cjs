// Render the actual report in Edge with saved provider evidence, never a new scan.
// Optional argument: a verified submission JSON fetched from the backend/database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const webpack = require('webpack');
const root = path.resolve(__dirname, '..');
const fixture = require('../src/pages/dashboard/__fixtures__/copyleaks-75-2.json');
const saved = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  : { transcribed_text: fixture.text, scan_result: fixture.report };
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'writecheck-yellow-'));
const entry = path.join(folder, 'entry.js');
const noop = path.join(folder, 'noop.js');
fs.writeFileSync(noop, 'module.exports = function() { return null; };');
fs.writeFileSync(entry, `
const React = require(${JSON.stringify(require.resolve('react'))});
const {createRoot} = require(${JSON.stringify(require.resolve('react-dom/client'))});
const {flushSync} = require(${JSON.stringify(require.resolve('react-dom'))});
const Review = require(${JSON.stringify(path.join(root, 'src/pages/dashboard/SubmissionReview.js'))}).default;
const saved = ${JSON.stringify(saved)};
const text = saved.transcribed_text, result = saved.scan_result;
const mode = new URLSearchParams(location.search).get('theme') || 'light';
document.documentElement.dataset.theme = mode;
let scans = 0;
const props = { submission:{id:'saved-example',studentName:'75.2% provider evidence verification',processingState:'ready',
  transcribedText:text,scanResult:result}, text,result,submissions:[],profile:{role:'teacher'},
  onRecheck:()=>scans++,onClose:()=>{},onCopy:()=>{},onExpandImage:()=>{},grading:null };
const root = createRoot(document.getElementById('app'));
const render = key => flushSync(()=>root.render(React.createElement(Review,{...props,key})));
const check = (ok,msg) => {if(!ok) throw Error(msg)};
const click = label => {
 const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);
 check(button,'Missing '+label);flushSync(()=>button.click());
};
const inspect = () => {
 const panel=document.getElementById('review-transcription');
 check(panel.textContent===text,'Canonical text changed');
 const marks=[...panel.querySelectorAll('mark')];
 check(marks.length===25,'Expected all 25 actual provider ranges');
 for(const fragment of result.matchedSources[0].matching_fragments) {
  const mark=marks.find(m=>m.textContent===text.slice(fragment.start,fragment.end));
  check(mark,'Missing range '+fragment.start);
  check(mark.dataset.sourceIds==='1c7886b81f','Wrong source identity');
  check(mark.dataset.matchTypes===fragment.match_kind,'Wrong comparison category');
 }
 const style=getComputedStyle(marks[0]);
 check(style.backgroundColor===(mode==='dark'?'rgb(73, 62, 35)':'rgb(254, 243, 205)'), 'Yellow background missing: '+style.backgroundColor);
 check(style.color!==style.backgroundColor,'Unreadable foreground');
 check(!panel.querySelector('mark mark'),'Nested marks');
 check(panel.scrollWidth<=panel.clientWidth+1,'Horizontal overflow');
 return {marks:marks.length,background:style.backgroundColor,color:style.color};
};
try {
 render('initial');click('Sources (1)');const initial=inspect();
 const title=[...document.querySelectorAll('mark')].find(m=>m.textContent.startsWith('Turnitin:'));
 flushSync(()=>title.click());
 check(document.querySelector('aside[aria-label="Selected match details"] a').href===${JSON.stringify(fixture.source.url)},'Wrong PMC source');
 click('Plain');check(!document.querySelector('#review-transcription mark'),'Plain still highlighted');
 check(document.getElementById('review-transcription').textContent===text,'Plain changed text');
 click('Sources (1)');inspect();
 render('reload');click('Sources (1)');inspect();
 check(scans===0,'Unexpected rescan');
 document.getElementById('review-transcription').scrollIntoView({block:'center'});
 document.getElementById('results').textContent=JSON.stringify({ok:true,theme:mode,...initial,scans,characters:text.length});
} catch(error) { document.getElementById('results').textContent=JSON.stringify({ok:false,error:error.message,stack:error.stack}); }
`);
webpack({mode:'development',devtool:false,entry,output:{path:folder,filename:'report.js'},
  resolve:{modules:[path.join(root,'node_modules'),'node_modules'],extensions:['.js','.json']},
  module:{rules:[{test:/\.js$/,include:path.join(root,'src'),use:{loader:require.resolve('babel-loader'),options:{
    babelrc:false,configFile:false,presets:[[require.resolve('@babel/preset-react'),{runtime:'automatic'}]]}}}]},
  plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})}),
    new webpack.NormalModuleReplacementPlugin(/^\.\/AssignmentComments$|^\.\/SubmissionFilePreview$/,noop)]
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
    console.log(JSON.stringify({...outcome,screenshot}));
  }
});

// Verify arbitrary saved reports, including pending -> ready, switching submissions and reload.
// No runtime or test fallback to a particular scan, score or source.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const webpack = require('webpack');
const root = path.resolve(__dirname, '..');
assert.ok(process.argv[2], 'Supply a JSON array of verified submission reports; there is no fixture fallback.');
const reports = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).map(item => item.row || item);
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'writecheck-live-evidence-'));
const entry = path.join(folder, 'entry.js');
const noop = path.join(folder, 'noop.js');
fs.writeFileSync(noop, 'module.exports = function() { return null; };');
fs.writeFileSync(entry, `
const React = require(${JSON.stringify(require.resolve('react'))});
const {createRoot} = require(${JSON.stringify(require.resolve('react-dom/client'))});
const {flushSync} = require(${JSON.stringify(require.resolve('react-dom'))});
const Review = require(${JSON.stringify(path.join(root, 'src/pages/dashboard/SubmissionReview.js'))}).default;
const {collectEvidence,evidenceSegments} = require(${JSON.stringify(path.join(root,'src/pages/dashboard/similarityEvidence.js'))});
const reports = ${JSON.stringify(reports)};
const mode = new URLSearchParams(location.search).get('theme') || 'light';
document.documentElement.dataset.theme=mode;
let scans=0;
const root=createRoot(document.getElementById('app'));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const render=(row,result,key)=>flushSync(()=>root.render(React.createElement(Review,{
 key,submission:{id:row.id,studentName:'Live evidence verification',transcribedText:row.transcribed_text,scanResult:result,processingState:'ready'},
 text:row.transcribed_text,result,submissions:[],profile:{role:'teacher'},onRecheck:()=>scans++,onClose:()=>{},onCopy:()=>{},onExpandImage:()=>{},grading:null
})));
const click=label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);check(button,'Missing '+label);flushSync(()=>button.click());};
try {
 const outcomes=[];
 for(const row of reports) {
  const text=row.transcribed_text,result=row.scan_result;
  const sources=result.matchedSources;
  const evidence=collectEvidence(text,result);
  check(evidence.ranges.length>0,'Missing ranges for '+row.id);
  const expected=evidenceSegments(text,evidence.ranges).filter(s=>s.matches.length).length;
  const pending={...result,evidenceStatus:'loading',matchedSources:sources.map(s=>({...s,matching_fragments:[]}))};
  render(row,pending,row.id);
  check(document.body.textContent.includes('Loading matching passages...'),'Missing pending message');
  render(row,result,row.id);
  click('Sources ('+sources.length+')');
  const inspect=()=>{
   const panel=document.getElementById('review-transcription');
   check(panel.textContent===text,'Changed transcription');
   const marks=[...panel.querySelectorAll('mark.essay-match')];
   check(marks.length===expected,'Wrong rendered range boundaries for '+row.id);
   check(!panel.querySelector('mark mark'),'Nested marks');
   for(const range of evidence.ranges) {
    check(marks.some(m=>m.dataset.sourceIds.split(' ').includes(String(range.id))),'Missing source '+range.id);
   }
   check(getComputedStyle(marks[0]).backgroundColor===(mode==='dark'?'rgb(73, 62, 35)':'rgb(254, 243, 205)'),'Wrong yellow style');
   return marks;
  };
  const marks=inspect();
  check(document.body.textContent.includes(result.score+'%'),'Wrong score');
  for(const source of sources.filter(s=>s.url && evidence.ranges.some(r=>r.id===s.id))) {
   const mark=marks.find(m=>m.dataset.sourceIds.split(' ').includes(String(source.id)));
   flushSync(()=>mark.click());
   const links=[...document.querySelectorAll('aside[aria-label="Selected match details"] a')];
   check(links.some(a=>a.href===new URL(source.url).href),'Wrong source link '+source.id);
  }
  click('Plain');check(!document.querySelector('#review-transcription mark'),'Plain still highlighted');
  click('Sources ('+sources.length+')');inspect();
  render(row,result,row.id+'-reload');click('Sources ('+sources.length+')');inspect();
  outcomes.push({submission_id:row.id,score:result.score,sources:sources.length,collected_ranges:evidence.ranges.length,rendered_marks:expected,characters:text.length});
 }
 check(scans===0,'Unexpected scan');
 document.getElementById('review-transcription').scrollIntoView({block:'center'});
 document.getElementById('results').textContent=JSON.stringify({ok:true,theme:mode,scans,outcomes});
} catch(error) {document.getElementById('results').textContent=JSON.stringify({ok:false,error:error.message,stack:error.stack});}
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
    const artifacts=path.join(root,'artifacts','copyleaks-general');
    fs.mkdirSync(artifacts,{recursive:true});
    fs.copyFileSync(screenshot,path.join(artifacts,theme+'.png'));
    fs.writeFileSync(path.join(artifacts,theme+'.json'),JSON.stringify(outcome,null,2));
    console.log(JSON.stringify({...outcome,screenshot:path.join(artifacts,theme+'.png')}));
  }
});

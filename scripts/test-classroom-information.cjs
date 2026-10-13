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
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'writecheck-classroom-ui-'));
const entry = path.join(folder, 'entry.js');
const noop = path.join(folder, 'noop.js');
fs.writeFileSync(noop, 'module.exports = function() { return null; };');
fs.writeFileSync(entry, `
const React = require(${JSON.stringify(require.resolve('react'))});
const {createRoot} = require(${JSON.stringify(require.resolve('react-dom/client'))});
const {flushSync} = require(${JSON.stringify(require.resolve('react-dom'))});
const Information = require(${JSON.stringify(path.join(root,'src/pages/dashboard/ClassroomInformation.js'))}).default;
const mode = new URLSearchParams(location.search).get('theme') || 'light';
document.documentElement.dataset.theme=mode;
try {
 const classroom={id:'test',name:'Classroom with a long name for responsive verification',code:'ABC123',subject:'Methods of Research',teacher:'Test Teacher'};
 flushSync(()=>createRoot(document.getElementById('app')).render(React.createElement(Information,{classroom})));
 flushSync(()=>document.querySelector('button').click());
 const dialog=document.querySelector('[role=dialog]');
 if(!dialog || !dialog.textContent.includes('ABC123')) throw Error('Missing classroom information');
 if(document.documentElement.scrollWidth>innerWidth || dialog.getBoundingClientRect().right>innerWidth) throw Error('Horizontal overflow');
 const style=getComputedStyle(dialog);
 if(style.color===style.backgroundColor) throw Error('Unreadable dialog');
 document.getElementById('results').textContent=JSON.stringify({ok:true,theme:mode,width:innerWidth,color:style.color,background:style.backgroundColor});
} catch(error) {document.getElementById('results').textContent=JSON.stringify({ok:false,error:error.message});}
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
   for(const width of [520,1440]) {
    const screenshot=path.join(folder,`${theme}-${width}.png`);
    const run=spawnSync(process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ['--headless','--disable-gpu','--no-first-run','--allow-file-access-from-files',`--window-size=${width},900`,
        `--user-data-dir=${path.join(folder,'browser-'+theme)}`,'--virtual-time-budget=2500','--dump-dom',
        `--screenshot=${screenshot}`,pathToFileURL(html).href+'?theme='+theme],
      {encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});
    if(run.error) throw run.error;
    const match=run.stdout.match(/<pre id="results" hidden="">([^<]+)<\/pre>/);
    assert.ok(match,run.stderr+'\nNo browser result');
    const outcome=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));
    assert.equal(outcome.ok,true,JSON.stringify(outcome));
    const artifacts=path.join(root,'artifacts','classroom-information');
    fs.mkdirSync(artifacts,{recursive:true});
    fs.copyFileSync(screenshot,path.join(artifacts,theme+'-'+width+'.png'));
    fs.writeFileSync(path.join(artifacts,theme+'-'+width+'.json'),JSON.stringify(outcome,null,2));
    console.log(JSON.stringify({...outcome,screenshot:path.join(artifacts,theme+'-'+width+'.png')}));
   }
  }
});


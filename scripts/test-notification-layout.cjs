// Render real notification components with inert data, then measure in Edge.
// Run after npm run build. No credentials or live database are used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
let compact = false, opened = false;
const rows = [{id:'n',type:'resubmission_requested',title:'Resubmission requested',
  message:'Action required: revise your assignment. ' + 'LongAssignmentTitle'.repeat(15),
  classroom_id:'c',assignment_id:'a',submission_id:'s',metadata:{classroom_name:'Methods of Research'},
  created_at:'2026-10-14T02:30:00Z',is_read:false}];
const react = {...React, useState(initial) {
  if (initial && Array.isArray(initial.rows)) initial = {...initial,rows,total:1,loading:false,identity:`s:all:1:${compact?5:20}`};
  if (compact && initial === false && !opened) { initial = true; opened = true; }
  return React.useState(initial);
}};
const code = require('@babel/core').transformSync(fs.readFileSync('src/pages/dashboard/Notifications.js','utf8'), {
  presets:[[require.resolve('@babel/preset-react'),{runtime:'automatic'}]],
  plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')],configFile:false,babelrc:false,
}).code;
const loaded = {exports:{}};
const mocks = {'react':react,'../../supabaseClient':{supabase:{}},'./Pagination':()=>null,'./notifications.css':{}};
new Function('require','module','exports',code)(name => mocks[name] || require(name),loaded,loaded.exports);
const model = {userId:'s',unread:12,version:0,refresh:()=>{}};
const page = renderToStaticMarkup(h(loaded.exports.NotificationsPage,{model,onOpen:()=>{}}));
compact = true;
const bell = renderToStaticMarkup(h(loaded.exports.NotificationBell,{model,onOpen:()=>{},onViewAll:()=>{}}));
const cssDir = path.resolve('build/static/css');
const css = fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8').replace(/@import[^;]+;/g,'')).join('\n');
const folder = fs.mkdtempSync(path.join(os.tmpdir(),'writecheck-notifications-'));
const file = path.join(folder,'notifications.html');
fs.writeFileSync(file, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>
<header style="display:flex;justify-content:space-between;padding:12px"><b>WriteCheck</b>${bell}</header><main style="padding:12px">${page}</main><pre id="results" style="display:none"></pre><script>
const table=document.querySelector('.notification-table'),panel=document.querySelector('.notification-panel');
const colors=()=>({background:getComputedStyle(panel).backgroundColor,text:getComputedStyle(panel).color,badge:getComputedStyle(document.querySelector('.notification-badge')).backgroundColor});
document.documentElement.dataset.theme='light';const light=colors();
document.documentElement.dataset.theme='dark';const dark=colors();
document.documentElement.dataset.theme='light';const restored=colors();
const rect=panel.getBoundingClientRect();
const measurements=JSON.stringify({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
table:getComputedStyle(table).display,row:getComputedStyle(table.querySelector('tbody tr')).display,
panelFits:rect.left>=0&&rect.right<=innerWidth,light,dark,restored});
document.getElementById('results').textContent=measurements;
if(parent!==window) parent.document.getElementById('results').textContent=measurements;
</script></body></html>`);
const edge = process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
for (const width of [1280,600,360]) {
  // Edge imposes a minimum outer window width; an iframe gives an exact viewport.
  const wrapper=path.join(folder,'viewport-'+width+'.html');
  fs.writeFileSync(wrapper,`<!doctype html><html><body><pre id="results"></pre><iframe style="border:0;width:${width}px;height:900px" src="${pathToFileURL(file).href}"></iframe></body></html>`);
  const run = spawnSync(edge,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--allow-file-access-from-files', '--virtual-time-budget=1000',
    `--user-data-dir=${path.join(folder,'profile-'+width)}`,`--window-size=${Math.max(width,800)},1000`,'--dump-dom',pathToFileURL(wrapper).href],{encoding:'utf8',timeout:45000,windowsHide:true,maxBuffer:4*1024*1024});
  if (run.error) throw run.error;
  const match = run.stdout.match(/<pre id="results"[^>]*>([^<]+)<\/pre>/);
  assert.ok(match,'Edge must return layout measurements');
  const result = JSON.parse(match[1]);
  assert.equal(result.width,width);
  assert.equal(result.overflow,false,'No horizontal overflow with long titles');
  assert.equal(result.panelFits,true,'Dropdown stays in viewport');
  assert.equal(result.row,result.width<768?'block':'table-row');
  assert.deepEqual(result.light,result.restored);
  assert.notEqual(result.light.background,result.dark.background);
  assert.notEqual(result.dark.background,result.dark.text);
  console.log(`PASS: notifications at ${result.width}px; responsive rows, dropdown bounds, long text, light/dark colors.`);
}
fs.unlinkSync(file);

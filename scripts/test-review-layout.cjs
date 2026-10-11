// Run after npm run build. Render the actual review component with inert data
// adapters, then check its compiled CSS in desktop and narrow Edge viewports.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
const code = require('@babel/core').transformSync(fs.readFileSync('src/pages/dashboard/SubmissionReview.js', 'utf8'), {
  presets:[[require.resolve('@babel/preset-react'), {runtime:'automatic'}]],
  plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')], configFile:false, babelrc:false,
}).code;
const loaded = {exports:{}};
const mocks = {
  './SubmissionFilePreview': () => h('div', null, 'Page 1 · Page 2 · Page 3'),
  './ClassmateMatches': () => h('section', null, 'Peer similarity'),
  './AssignmentComments': () => h('div', null, 'Class and private comments'),
  './Pagination': {PaginatedList: ({items,children}) => children(items)},
  './shared': {formatDateTime: () => 'October 11, 2026', StatusMessage: () => null},
};
new Function('require','module','exports',code)(name => mocks[name] || require(name),loaded,loaded.exports);
const Review = loaded.exports.default;
const markup = renderToStaticMarkup(h(Review, {
  submission:{id:'work',studentName:'Alex',classroomName:'CSST 106',assignmentTitle:'Essay',processingState:'ready',transcribedText:'Paragraph.\n'.repeat(250)},
  text:'Paragraph.\n'.repeat(250), result:{score:24,matchedSources:[{url:'https://example.com/'+'a'.repeat(300)}]},
  grading:h('form',{className:'rounded-xl border bg-gray-50 p-4'}, h('h3',null,'Grading'),
    h('label',null,'Grade',h('input',{className:'w-full border bg-white',defaultValue:'85'})),
    h('label',null,'Feedback',h('textarea',{className:'w-full border bg-white',defaultValue:'Good evidence'})),
    h('button',{className:'bg-[#137333] px-3 py-2 text-white'},'Save Grade')),
}));
const cssDir = path.resolve('build/static/css');
const css = fs.readdirSync(cssDir).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(cssDir,file),'utf8').replace(/@import[^;]+;/g,'')).join('\n');
const folder = fs.mkdtempSync(path.join(os.tmpdir(),'writecheck-review-layout-'));
const file = path.join(folder,'review.html');
fs.writeFileSync(file, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${markup}<pre id="results"></pre><script>
  const area=document.querySelector('.review-workspace'), grid=document.querySelector('.review-columns'), grade=document.querySelector('.review-grading');
  document.querySelectorAll('details').forEach(node => node.open=true);
  const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}};
  const read=()=>({panel:getComputedStyle(area).backgroundColor,text:getComputedStyle(area).color,input:getComputedStyle(document.querySelector('#review-transcription')).backgroundColor});
  document.documentElement.dataset.theme='light';const light=read();
  document.documentElement.dataset.theme='dark';const dark=read();
  document.documentElement.dataset.theme='light';const restored=read();
  const before=rect(grade);area.scrollTop=80;const after=rect(grade);
  document.getElementById('results').textContent=JSON.stringify({width:innerWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,position:getComputedStyle(grade).position,
    overflowing:area.scrollWidth>area.clientWidth+1 || document.documentElement.scrollWidth>innerWidth,work:rect(grid.firstElementChild),grade:rect(grade),before,after,light,dark,restored});
  </script></body></html>`);
for (const width of [1280,540]) {
  const run=spawnSync(process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless','--disable-gpu','--no-first-run',`--window-size=${width},900`,`--user-data-dir=${path.join(folder,'browser-'+width)}`,'--dump-dom',pathToFileURL(file).href],
    {encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});
  if(run.error) throw run.error;
  assert.equal(run.status,0,run.stderr);
  const data=JSON.parse(run.stdout.match(/<pre id="results">([^<]+)<\/pre>/)[1]);
  assert.equal(data.overflowing,false,'Long text and URLs must not cause horizontal overflow');
  assert.deepEqual(data.light,data.restored,'Light colors restore without reload');
  assert.equal(data.dark.panel,'rgb(41, 42, 45)','Homepage dark panel palette');
  if(width>=1024){
    assert.equal(data.columns,2);assert.equal(data.position,'sticky');
    assert.ok(data.grade.left>=data.work.right);
    assert.ok(data.after.top>=16,'Sticky grading stays accessible inside the scrolling review');
  } else {
    assert.equal(data.columns,1);assert.equal(data.position,'static');
    assert.ok(data.grade.top>=data.work.bottom,'Work precedes grading on narrow screens');
  }
  console.log(`Review layout passed at ${data.width}px: ${data.columns} column(s), no overflow, light/dark verified.`);
}
fs.unlinkSync(file);

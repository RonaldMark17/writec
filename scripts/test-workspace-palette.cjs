// Run after npm run build. Uses the installed Edge browser to verify real CSS
// resolution and live theme switching on representative existing UI utilities.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const palette = require('../src/darkPalette.json');
const edge = process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cssDir = path.resolve('build/static/css');
const css = fs.readdirSync(cssDir).filter(file => file.endsWith('.css'))
  .map(file => fs.readFileSync(path.join(cssDir, file), 'utf8').replace(/@import\s+(?:url\([^)]*\)|"[^"]*"|\x27[^\x27]*\x27)\s*;/g, '')).join('\n');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'writecheck-palette-'));
const file = path.join(folder, 'palette.html');
fs.writeFileSync(file, `<!doctype html><html><head><style>${css}</style></head><body>
  <main id="page" class="bg-[#f8f9fa] text-[#202124]">
    <header id="nav" class="bg-white">Navigation</header>
    <section id="panel" class="bg-white border border-[#dadce0]">Classroom / modal / result</section>
    <section id="secondary" class="bg-[#f1f3f4] text-[#5f6368]">Comments / table / empty state</section>
    <input id="input" class="bg-[#fafafa] text-[#202124]" value="Class code">
    <button id="action" class="bg-[#137333] text-white">Submit</button>
    <p id="error" class="validation-error">Classroom not found</p>
    <div id="home" style="background:var(--page-bg);color:var(--page-text)">Homepage</div>
    <section id="brand-card" class="bg-[#137333]"><span id="brand-title" class="text-white">Class title</span></section>
    <button id="avatar" class="bg-[#137333] bg-gradient-to-tr from-[#137333] to-[#2e7d32] text-white">MS</button>
    <p id="muted" class="text-gray-400">Timestamp</p>
    <button id="disabled" disabled class="bg-[#137333] text-white disabled:opacity-50">Post comment</button>
    <input id="placeholder" placeholder="Enter your grade" class="bg-white placeholder:text-gray-400">
    <section class="review-workspace"><mark id="online" class="essay-match">Online source</mark><mark id="peer" class="essay-match essay-match-peer">Peer similarity</mark></section>
    <div class="landing-page"><button id="register" class="landing-nav-register bg-[var(--accent)] text-white">Get started</button><button id="demo-disabled" class="demo-run" disabled>Run check</button></div>
  </main><pre id="results"></pre><script>
    const read = () => Object.fromEntries(['page','nav','panel','secondary','input','action','error','home','brand-card','brand-title','avatar','muted','disabled','placeholder','online','peer','register','demo-disabled'].map(id => {
      const s = getComputedStyle(document.getElementById(id));
      return [id, {background:s.backgroundColor,text:s.color,border:s.borderColor,opacity:s.opacity,placeholder:getComputedStyle(document.getElementById(id),'::placeholder').color}];
    }));
    document.documentElement.dataset.theme = 'light'; const light = read();
    document.documentElement.dataset.theme = 'dark'; const dark = read();
    document.documentElement.dataset.theme = 'light'; const restored = read();
    document.getElementById('results').textContent = JSON.stringify({light,dark,restored});
  </script></body></html>`);
const result = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${path.join(folder, 'browser')}`, '--dump-dom', pathToFileURL(file).href],
  { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
const data = JSON.parse(result.stdout.match(/<pre id="results">([^<]+)<\/pre>/)[1]);
const rgb = hex => `rgb(${[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)).join(', ')})`;
assert.deepEqual(data.light, data.restored, 'Theme switching must restore all light colors without reload');
assert.equal(data.light.panel.background, 'rgb(255, 255, 255)');
assert.equal(data.light.page.background, 'rgb(248, 249, 250)');
assert.equal(data.dark.page.background, rgb(palette['--page-bg']));
assert.equal(data.dark.home.background, data.dark.page.background);
assert.equal(data.dark.panel.background, rgb(palette['--panel']));
assert.equal(data.dark.panel.border, rgb(palette['--border']));
assert.equal(data.dark.secondary.background, rgb(palette['--panel-soft']));
assert.equal(data.dark.secondary.text, rgb(palette['--text-secondary']));
assert.equal(data.dark.page.text, rgb(palette['--page-text']));
assert.equal(data.dark.action.background, rgb(palette['--accent']));
assert.equal(data.dark.action.text, rgb(palette['--page-bg']));
assert.equal(data.dark.error.text, 'rgb(242, 184, 181)');
assert.notEqual(data.dark.input.background, data.light.input.background);

const channels = value => value.match(/[\d.]+/g).slice(0,3).map(Number);
const luminance = value => channels(value).map(v => {v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
for(const id of ['action','disabled','online','peer','register','demo-disabled']) assert.ok(contrast(data.dark[id].text,data.dark[id].background)>=4.5, `${id} text must meet 4.5:1 in dark mode`);
assert.equal(data.dark.avatar.text, 'rgb(255, 255, 255)', 'Gradient avatar initials retain light text');
assert.equal(data.dark.disabled.opacity, '1', 'Disabled labels must not be faded');
assert.ok(contrast(data.dark['brand-title'].text,data.dark['brand-card'].background)>=4.5, 'White banner title must remain on dark brand background');
assert.ok(contrast(data.dark.muted.text,data.dark.panel.background)>=4.5, 'Muted metadata must be readable');
assert.ok(contrast(data.dark.placeholder.placeholder,data.dark.placeholder.background)>=4.5, 'Placeholder must be readable');
assert.notEqual(data.dark.online.background,data.dark.peer.background, 'Online and peer highlights remain distinct');
console.log('26 browser palette checks passed: contrast, disabled controls, highlights, brand cards, landing actions and light restoration.');

fs.unlinkSync(file);

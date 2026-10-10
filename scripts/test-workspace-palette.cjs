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
  .map(file => fs.readFileSync(path.join(cssDir, file), 'utf8').replace(/@import[^;]+;/g, '')).join('\n');
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
  </main><pre id="results"></pre><script>
    const read = () => Object.fromEntries(['page','nav','panel','secondary','input','action','error','home'].map(id => {
      const s = getComputedStyle(document.getElementById(id));
      return [id, {background:s.backgroundColor,text:s.color,border:s.borderColor}];
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
assert.equal(data.dark.secondary.text, rgb(palette['--muted']));
assert.equal(data.dark.page.text, rgb(palette['--page-text']));
assert.equal(data.dark.action.background, rgb(palette['--accent']));
assert.equal(data.dark.action.text, rgb(palette['--page-bg']));
assert.equal(data.dark.error.text, 'rgb(242, 184, 181)');
assert.notEqual(data.dark.input.background, data.light.input.background);
console.log('14 browser palette checks passed: shared homepage colors, controls, errors, and light restoration.');
fs.unlinkSync(file);

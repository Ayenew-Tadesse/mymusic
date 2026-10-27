/**
 * Builds the demo version of the web app as ONE self-contained file and
 * writes it to the repository root as index.html, so GitHub Pages serves the
 * app whether Pages deploys from the branch or from GitHub Actions.
 * Run with: npm run build:pages   (then commit ../index.html)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..');
const out = path.join(web, 'demo-dist');
execSync('npm run build:demo', { cwd: web, stdio: 'inherit' });

const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const assets = path.join(out, 'assets');
const file = (ext) => fs.readFileSync(path.join(assets, fs.readdirSync(assets).find((f) => f.endsWith(ext))), 'utf8');
const css = file('.css').replaceAll('</style', '<\\/style');
const js = file('.js').replaceAll('</script', '<\\/script');
const favicon = `data:image/svg+xml,${encodeURIComponent(fs.readFileSync(path.join(out, 'favicon.svg'), 'utf8'))}`;

const page = html
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${favicon}" type="image/svg+xml" />`)
  .replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, () => '')
  .replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => `<style>${css}</style>`)
  .replace('</body>', () => `<script type="module">${js}</script>\n</body>`)
  .replace('<title>MyMusic</title>', '<title>MyMusic (demo)</title>');

const target = path.resolve(web, '..', 'index.html');
fs.writeFileSync(target, page);
console.log(`Wrote ${target} (${Math.round(page.length / 1024)} KB)`);

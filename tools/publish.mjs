#!/usr/bin/env node
/**
 * Publishes one trip page to the public site.
 *
 *   node tools/publish.mjs kansai-2027.html
 *
 * What it does:
 *   1. reads the trip:* meta tags from the page in the project root
 *   2. adds (or replaces) its card in the AUTO-TRIPS block of index.html
 *   3. rebuilds docs/ with the same masking rules as `npm run mask`
 *   4. commits docs/<page> + docs/index.html and pushes
 *
 * Flags:
 *   --dry-run   show what would change, write and commit nothing
 *   --no-push   commit locally but do not push
 *
 * The raw page stays in the project root and is git-ignored; only the masked
 * build in docs/ is ever published.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readConfig, maskText } from './mask.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = path.join(root, 'docs');
const INDEX_HTML = path.join(root, 'index.html');
const TRIPS_JSON = path.join(OUT, 'trips.json');
const LANDING = 'index.html';
const START_MARK = '/* >>> AUTO-TRIPS';
const END_MARK = '/* <<< AUTO-TRIPS';
const THEMES = ['pink', 'matcha', 'tan'];
const DEFAULT_DESC = '我的新旅程，正在編寫中。';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_PUSH = argv.includes('--no-push');
const fileArg = argv.find((arg) => !arg.startsWith('--'));

function fail(message) {
  console.error('\n! ' + message + '\n');
  process.exit(1);
}

function listTripFiles() {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name) && entry.name.toLowerCase() !== LANDING)
    .map((entry) => entry.name)
    .sort();
}

function resolveTarget() {
  const files = listTripFiles();
  if (!fileArg) {
    fail(
      'Which trip? Pass a filename, for example:\n\n' +
      '    npm run publish -- kansai-2027.html\n\n' +
      'Pages found in the project root:\n' +
      (files.length ? files.map((name) => '    - ' + name).join('\n') : '    (none)')
    );
  }

  let name = String(fileArg).replace(/^\.?[\\/]+/, '');
  if (/[\\/]/.test(name)) fail('Pass just the filename, not a path: ' + fileArg);
  if (!/\.html?$/i.test(name)) name += '.html';
  if (name.toLowerCase() === LANDING) fail('index.html is the landing page, not a trip page.');

  const full = path.join(root, name);
  if (!fs.existsSync(full)) fail('File not found in the project root: ' + name);
  return { name, full };
}

/** Read <meta name="trip:*" content="..."> regardless of attribute order. */
function parseMeta(html) {
  const meta = {};
  const tagRe = /<meta\b[^>]*>/gi;
  let tag;
  while ((tag = tagRe.exec(html))) {
    const attrs = {};
    const attrRe = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let attr;
    while ((attr = attrRe.exec(tag[0]))) {
      attrs[attr[1].toLowerCase()] = attr[3] !== undefined ? attr[3] : attr[4];
    }
    const name = String(attrs.name || '').toLowerCase();
    if (name.startsWith('trip:')) meta[name.slice(5)] = decodeEntities(String(attrs.content || '').trim());
  }
  return meta;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function slugOf(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseISO(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null;
  return date;
}

function formatRange(start, end) {
  const a = parseISO(start);
  if (!a) return '';
  const b = parseISO(end);
  const left = a.getFullYear() + '.' + pad(a.getMonth() + 1) + '.' + pad(a.getDate());
  if (!b || end === start) return left;
  const bFull = b.getFullYear() + '.' + pad(b.getMonth() + 1) + '.' + pad(b.getDate());
  return left + ' – ' + (b.getFullYear() === a.getFullYear() ? bFull.slice(5) : bFull);
}

function calcDays(start, end) {
  const a = parseISO(start);
  const b = parseISO(end || start);
  if (!a || !b || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

function buildCard(meta, href) {
  const start = parseISO(meta.start) ? meta.start : '';
  const end = parseISO(meta.end) ? meta.end : start;
  const days = start ? calcDays(start, end) : 1;
  const destination = meta.destination || meta.title;
  const ghost = destination.replace(/[・\s]/g, '').slice(0, 2) || '旅';

  return {
    id: 'p-' + (slugOf(href.replace(/\.html?$/i, '')) || Date.now().toString(36)),
    title: meta.title,
    destination: destination,
    ghost: ghost,
    start: start,
    end: end,
    days: days,
    nights: Math.max(days - 1, 0),
    dateLabel: start ? formatRange(start, end) : '日期待定',
    desc: meta.desc || DEFAULT_DESC,
    emoji: meta.emoji || '✈️',
    theme: THEMES.indexOf(meta.theme) > -1 ? meta.theme : 'pink',
    href: href,
    tags: ['自訂旅程'],
    added: Date.now()
  };
}

/** Parse the machine-managed block as a JSON array of cards. */
function readBlock(html) {
  const startAt = html.indexOf(START_MARK);
  const endAt = html.indexOf(END_MARK);
  if (startAt === -1 || endAt === -1 || endAt < startAt) {
    fail('Could not find the AUTO-TRIPS markers in index.html.');
  }
  const bodyStart = html.indexOf('\n', startAt) + 1;
  const body = html.slice(bodyStart, endAt).trim().replace(/,\s*$/, '');
  if (!body) return { startAt, endAt, bodyStart, list: [] };
  try {
    const parsed = JSON.parse('[' + body + ']');
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return { startAt, endAt, bodyStart, list: parsed };
  } catch (error) {
    fail(
      'The AUTO-TRIPS block in index.html is not valid JSON anymore.\n' +
      'Fix it by hand (or empty it and republish): ' + error.message
    );
  }
}

function renderBlock(list) {
  if (!list.length) return '';
  return list.map((card) => {
    return JSON.stringify(card, null, 2).split('\n').map((line) => '    ' + line).join('\n') + ',';
  }).join('\n') + '\n    ';
}

function run(command, args, options) {
  const result = spawnSync(command, args, Object.assign({ cwd: root, encoding: 'utf8' }, options || {}));
  if (result.error) fail('Could not run ' + command + ': ' + result.error.message);
  return result;
}

function git(args) {
  const result = run('git', args);
  if (result.status !== 0) {
    fail('git ' + args.join(' ') + ' failed:\n' + (result.stderr || result.stdout).trim());
  }
  return result;
}

function main() {
  const { name, full } = resolveTarget();

  // A filename that masking would rewrite would publish to a different path than
  // the card points at, so reject it before touching index.html.
  const config = readConfig();
  if (maskText(name, config).output !== name) {
    fail(
      'The filename contains something the masker redacts (a date, flight number or private term):\n' +
      '  ' + name + '\n' +
      'Rename it without the redacted part, for example kansai-2030.html.'
    );
  }

  const html = fs.readFileSync(full, 'utf8');
  const meta = parseMeta(html);

  if (!meta.title) fail('No <meta name="trip:title" content="…"> in ' + name + '. Add one and try again.');
  if (!fs.existsSync(INDEX_HTML)) fail('index.html not found in the project root.');

  const card = buildCard(meta, name);
  const landing = fs.readFileSync(INDEX_HTML, 'utf8');
  const block = readBlock(landing);

  const existing = block.list.find((item) => String(item.href || '').toLowerCase() === name.toLowerCase());
  const next = block.list.filter((item) => String(item.href || '').toLowerCase() !== name.toLowerCase());
  next.unshift(card);

  const updated = landing.slice(0, block.bodyStart) + renderBlock(next) + landing.slice(block.endAt);

  console.log('\n' + (existing ? 'Updating' : 'Adding') + ' card:');
  console.log('  title       ' + card.title);
  console.log('  destination ' + card.destination);
  console.log('  dates       ' + card.dateLabel + '  (' + card.days + ' days)');
  console.log('  page        docs/' + name);
  console.log('  theme       ' + card.theme + '  ' + card.emoji);

  if (DRY) {
    console.log('\n--dry-run: nothing written. The card above would be added to docs/index.html.');
    return;
  }

  fs.writeFileSync(INDEX_HTML, updated, 'utf8');
  console.log('\nRebuilding docs/ …');
  const mask = run('node', [path.join('tools', 'mask.mjs')], { stdio: 'inherit' });
  if (mask.status !== 0) fail('Masking failed; index.html was updated, so fix the error and run again.');

  const published = path.join(OUT, name);
  if (!fs.existsSync(published)) fail('Expected masked file at docs/' + name + ' but it is missing.');

  // A browser-published copy of the same page may still sit in the JSON index.
  const touched = [path.join('docs', name), path.join('docs', LANDING)];
  if (fs.existsSync(TRIPS_JSON)) {
    let list;
    try {
      list = JSON.parse(fs.readFileSync(TRIPS_JSON, 'utf8'));
    } catch (error) {
      fail('docs/trips.json is not valid JSON: ' + error.message);
    }
    if (Array.isArray(list)) {
      const kept = list.filter((item) => String((item && item.href) || '').toLowerCase() !== name.toLowerCase());
      if (kept.length !== list.length) {
        fs.writeFileSync(TRIPS_JSON, JSON.stringify(kept, null, 2) + '\n', 'utf8');
        console.log('Removed the browser-published duplicate from docs/trips.json.');
      }
      touched.push(path.join('docs', 'trips.json'));
    }
  }

  git(['add', '--'].concat(touched));

  const staged = run('git', ['diff', '--cached', '--name-only']);
  if (!staged.stdout.trim()) {
    console.log('\nNothing to commit — docs/ already matches this page.');
    return;
  }

  git(['commit', '-m', 'Publish trip: ' + card.title]);
  console.log('\nCommitted ' + staged.stdout.trim().split(/\r?\n/).join(', '));

  if (NO_PUSH) {
    console.log('\n--no-push: commit is local only. Run "git push" when ready.');
    return;
  }

  git(['push']);
  console.log('\nPushed. GitHub Pages rebuilds in about a minute:');
  console.log('  https://beartoinfinity-crypto.github.io/travel-eye/' + name + '\n');
}

main();

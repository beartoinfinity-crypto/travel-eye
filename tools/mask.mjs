#!/usr/bin/env node
/**
 * Builds the publishable site.
 *
 *   *.html   your real pages in the project root (git-ignored, never committed)
 *   docs/    the masked copy that gets pushed to GitHub
 *
 * Usage:
 *   node tools/mask.mjs           rebuild docs/ from the root pages
 *   node tools/mask.mjs --check   fail if docs/ is stale or still contains raw data
 *   node tools/mask.mjs --watch   rebuild whenever a root page changes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SRC = root;
const OUT = path.join(root, 'docs');
const INDEX = path.join(OUT, 'trips.json');
const CONFIG = path.join(root, 'mask.config.json');
const LOCAL = path.join(root, 'mask.local.json');

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const WATCH = args.has('--watch');

const REDACTED = '✱✱✱';

/** JSON.parse that tolerates the BOM Windows editors like to add. */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

export function readConfig() {
  if (!fs.existsSync(CONFIG)) {
    console.error('Missing mask.config.json');
    process.exit(1);
  }
  const config = readJson(CONFIG);

  // mask.local.json is git-ignored: keep real names, hotels and booking refs here.
  if (fs.existsSync(LOCAL)) {
    const local = readJson(LOCAL);
    for (const key of ['rules', 'terms', 'protect']) {
      if (Array.isArray(local[key])) config[key] = [...(config[key] || []), ...local[key]];
    }
  }

  const rules = (config.rules || []).map((rule) => ({
    id: rule.id || rule.pattern,
    pattern: rule.pattern,
    flags: rule.flags || 'g',
    replace: rule.replace
  }));
  const terms = (config.terms || []).filter((term) => term && term.find);
  const protect = (config.protect || []).filter((block) => block && block.start && block.end);
  return { rules, terms, protect };
}

function expand(template, groups) {
  return String(template).replace(/\$(\d)/g, (_, index) => {
    const value = groups[Number(index)];
    return value === undefined ? '' : value;
  });
}

export function maskText(text, config) {
  const counts = Object.create(null);
  const { output: protectedText, store } = protectSegments(text, config.protect);
  let output = protectedText;

  for (const rule of config.rules) {
    const regex = new RegExp(rule.pattern, rule.flags.includes('g') ? rule.flags : rule.flags + 'g');
    output = output.replace(regex, (...args) => {
      const groups = args.slice(0, -2);
      const next = expand(rule.replace, groups);
      if (next !== groups[0]) counts[rule.id] = (counts[rule.id] || 0) + 1;
      return next;
    });
  }

  for (const term of config.terms) {
    const escaped = String(term.find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    output = output.replace(regex, () => {
      counts['term:' + term.find] = (counts['term:' + term.find] || 0) + 1;
      return term.replace || REDACTED;
    });
  }

  return { output: restoreSegments(output, store), counts, scan: output };
}

/** Text between config.protect markers is copied through untouched. */
function protectSegments(text, blocks) {
  const store = [];
  let output = text;
  for (const block of blocks || []) {
    if (!block.start || !block.end) continue;
    let cursor = 0;
    for (;;) {
      const start = output.indexOf(block.start, cursor);
      if (start === -1) break;
      const end = output.indexOf(block.end, start);
      if (end === -1) break;
      const stop = end + block.end.length;
      const token = '\u0000MASK' + store.length + '\u0000';
      store.push(output.slice(start, stop));
      output = output.slice(0, start) + token + output.slice(stop);
      cursor = start + token.length;
    }
  }
  return { output, store };
}

function restoreSegments(text, store) {
  return text.replace(/\u0000MASK(\d+)\u0000/g, (_, index) => store[Number(index)]);
}

/** Patterns that must never survive into docs/. */
const LEAK_PATTERNS = [
  { label: 'full date (YYYY-MM-DD)', pattern: /\b\d{4}-\d{2}-\d{2}\b/g },
  { label: 'full date (YYYY.MM.DD)', pattern: /\b\d{4}\.\d{2}\.\d{2}\b/g },
  { label: 'short date (M/D)', pattern: /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\b/g },
  { label: 'date range (MM.DD)', pattern: /(?<![\d.])\d{2}\.\d{2}(?![\d])/g },
  { label: 'flight number', pattern: /\b(?:UO|HX|CX|NH|JL|MM|GK|TR|BR|CI|KE|TG|SQ|MH|FD|SL|JX|IT|JQ|VA|QF|NZ|BA|AF|KL|LH|EK|QR|TK|UA|DL|AA)\s?\d{2,4}\b/g },
  { label: 'email address', pattern: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g }
];

function listHtml(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** Pages published from the browser live only in docs/ and are listed in trips.json. */
function readIndexHrefs() {
  if (!fs.existsSync(INDEX)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(INDEX, 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => String((item && item.href) || '').trim())
      .filter((href) => href && href === path.basename(href) && /\.html?$/i.test(href));
  } catch (error) {
    console.error('\n! docs/trips.json is not valid JSON: ' + error.message);
    process.exit(1);
  }
}

function findLeaks(text) {
  const found = [];
  for (const leak of LEAK_PATTERNS) {
    const hits = text.match(leak.pattern);
    if (hits) found.push({ label: leak.label, samples: [...new Set(hits)].slice(0, 5) });
  }
  return found;
}

/** trips.json is committed too, so re-mask it and fail `--check` if it drifted. */
function buildIndex(config) {
  if (!fs.existsSync(INDEX)) return null;
  const source = fs.readFileSync(INDEX, 'utf8');
  const { output, counts, scan } = maskText(source, config);
  const changed = output !== source;
  if (!CHECK && changed) fs.writeFileSync(INDEX, output);
  return { name: 'docs/trips.json', changed, counts, leftovers: findLeaks(scan), bytes: Buffer.byteLength(output) };
}

function build() {
  const config = readConfig();
  const files = listHtml(SRC);

  if (!files.length) {
    console.error('No HTML files found in the project root. Put index.html (and any trip pages) next to this folder.');
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });

  const report = [];
  for (const name of files) {
    const source = fs.readFileSync(path.join(SRC, name), 'utf8');
    const { output, counts, scan } = maskText(source, config);

    const target = path.join(OUT, name);
    const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    const changed = previous !== output;

    if (!CHECK) fs.writeFileSync(target, output);

    report.push({ name, changed, counts, leftovers: findLeaks(scan), bytes: Buffer.byteLength(output) });
  }

  // Anything left in docs/ that is not in src/ or trips.json should be reported, not deleted silently.
  const published = readIndexHrefs();
  const orphans = listHtml(OUT).filter((name) => !files.includes(name) && !published.includes(name));

  return { report, index: buildIndex(config), orphans };
}

function printReport({ report, index, orphans }) {
  let total = 0;
  for (const file of report) {
    const entries = Object.entries(file.counts).sort((a, b) => b[1] - a[1]);
    const sum = entries.reduce((acc, [, n]) => acc + n, 0);
    total += sum;
    console.log(`\n${file.name}  (${(file.bytes / 1024).toFixed(1)} kB)`);
    if (!entries.length) {
      console.log('  no matches - check that mask.config.json covers this file');
    }
    for (const [id, count] of entries) console.log(`  ${String(count).padStart(4)}  ${id}`);
    for (const leak of file.leftovers) {
      console.log(`  ! left over: ${leak.label} -> ${leak.samples.join(', ')}`);
    }
    if (CHECK && file.changed) console.log('  ! docs/ is out of date for this file');
  }

  if (index) {
    const entries = Object.entries(index.counts).sort((a, b) => b[1] - a[1]);
    total += entries.reduce((acc, [, n]) => acc + n, 0);
    console.log(`\n${index.name}  (browser-published cards)`);
    for (const [id, count] of entries) console.log(`  ${String(count).padStart(4)}  ${id}`);
    for (const leak of index.leftovers) {
      console.log(`  ! left over: ${leak.label} -> ${leak.samples.join(', ')}`);
    }
    if (CHECK && index.changed) console.log('  ! docs/trips.json still has unmasked values');
  }

  if (orphans.length) {
    console.log(`\n! docs/ contains files that are not in src/ or trips.json: ${orphans.join(', ')}`);
  }
  console.log(`\n${total} value(s) masked across ${report.length} file(s)${index ? ' plus docs/trips.json' : ''}.`);
}

function checkFailed({ report, index, orphans }) {
  if (orphans.length) return true;
  if (index && (index.changed || index.leftovers.length)) return true;
  return report.some((file) => file.changed || file.leftovers.length);
}

function run() {
  const result = build();
  printReport(result);

  if (CHECK) {
    if (checkFailed(result)) {
      console.error('\nCheck failed: run "npm run mask" and commit the result.\n');
      process.exit(1);
    }
    console.log('\nOK - docs/ is up to date and contains no raw dates, flight numbers or emails.\n');
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  run();

  if (WATCH) {
    console.log('\nWatching the project root for changes... (Ctrl+C to stop)');
    let timer = null;
    fs.watch(SRC, { recursive: false }, (event, filename) => {
      if (!filename || !/\.html?$/i.test(filename)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          run();
        } catch (error) {
          console.error(error.message);
        }
      }, 120);
    });
  }
}

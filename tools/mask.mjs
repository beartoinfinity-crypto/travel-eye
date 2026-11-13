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

function readConfig() {
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

function maskText(text, config) {
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

    const leftovers = [];
    for (const leak of LEAK_PATTERNS) {
      const hits = scan.match(leak.pattern);
      if (hits) leftovers.push({ label: leak.label, samples: [...new Set(hits)].slice(0, 5) });
    }

    report.push({ name, changed, counts, leftovers, bytes: Buffer.byteLength(output) });
  }

  // Anything left in docs/ that is not in src/ should be reported, not deleted silently.
  const orphans = listHtml(OUT).filter((name) => !files.includes(name));

  return { report, orphans };
}

function printReport({ report, orphans }) {
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
  if (orphans.length) {
    console.log(`\n! docs/ contains files that are not in src/: ${orphans.join(', ')}`);
  }
  console.log(`\n${total} value(s) masked across ${report.length} file(s).`);
}

function checkFailed({ report, orphans }) {
  if (orphans.length) return true;
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

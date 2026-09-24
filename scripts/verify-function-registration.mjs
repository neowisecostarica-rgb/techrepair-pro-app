#!/usr/bin/env node
/**
 * verify-function-registration.mjs
 *
 * Verifies that every deployable Base44 function under base44/functions/ has:
 *   1. An entry.ts file
 *   2. A valid function.jsonc manifest
 *   3. manifest.name === directory name
 *   4. manifest.entry === 'entry.ts'
 *
 * Also verifies that every literal functions.invoke('name') target in src/
 * resolves to a registered function directory.
 *
 * Excludes _shared (not deployable) and intentional internal calls
 * (e.g. __internal_invite).
 *
 * Exit 0 = PASS, exit 1 = FAIL.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const FN_DIR = join(ROOT, 'base44', 'functions');
const SRC_DIR = join(ROOT, 'src');

const INTERNAL_CALL_PATTERNS = ['__internal_'];

let errors = [];
let warnings = [];

// --- 1. Verify every deployable function directory ---
const fnDirs = readdirSync(FN_DIR).filter(d => {
  const full = join(FN_DIR, d);
  return statSync(full).isDirectory() && d !== '_shared';
});

for (const dir of fnDirs) {
  const dirPath = join(FN_DIR, dir);
  const entryPath = join(dirPath, 'entry.ts');
  const manifestPath = join(dirPath, 'function.jsonc');

  if (!existsSync(entryPath)) {
    errors.push(`[${dir}] Missing entry.ts`);
    continue;
  }

  if (!existsSync(manifestPath)) {
    errors.push(`[${dir}] Missing function.jsonc manifest`);
    continue;
  }

  // Parse manifest (jsonc — strip comments naively)
  let manifest;
  try {
    const raw = readFileSync(manifestPath, 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    manifest = JSON.parse(raw);
  } catch (e) {
    errors.push(`[${dir}] Invalid function.jsonc JSON: ${e.message}`);
    continue;
  }

  if (manifest.name !== dir) {
    errors.push(`[${dir}] manifest.name ("${manifest.name}") !== directory name ("${dir}")`);
  }

  if (manifest.entry !== 'entry.ts') {
    errors.push(`[${dir}] manifest.entry ("${manifest.entry}") !== "entry.ts"`);
  }
}

// --- 2. Scan src/ for functions.invoke('name') targets ---
const invokeTargets = new Set();

function scanDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      const content = readFileSync(full, 'utf8');
      const regex = /functions\.invoke\(\s*['"`]([^'"`]+)['"`]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const target = match[1];
        if (INTERNAL_CALL_PATTERNS.some(p => target.startsWith(p))) continue;
        invokeTargets.add(target);
      }
    }
  }
}

if (existsSync(SRC_DIR)) {
  scanDir(SRC_DIR);
}

const registeredSet = new Set(fnDirs);
for (const target of [...invokeTargets].sort()) {
  if (!registeredSet.has(target)) {
    errors.push(`Invoke target "${target}" does not resolve to any registered function directory`);
  }
}

// --- 3. Report ---
const totalDirs = fnDirs.length;
const totalTargets = invokeTargets.size;

console.log(`\n=== Function Registration Verification ===`);
console.log(`Deployable function directories: ${totalDirs}`);
console.log(`Invoke targets found in src/:    ${totalTargets}`);

if (errors.length === 0) {
  console.log(`\n✅ PASS — All functions registered and all invoke targets resolve.\n`);
  process.exit(0);
} else {
  console.log(`\n❌ FAIL — ${errors.length} issue(s) found:\n`);
  for (const e of errors) {
    console.log(`  • ${e}`);
  }
  console.log('');
  process.exit(1);
}
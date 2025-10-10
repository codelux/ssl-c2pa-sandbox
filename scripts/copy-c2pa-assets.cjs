#!/usr/bin/env node
// Copy c2pa WASM/worker assets from node_modules into public/c2pa
const fs = require('fs');
const path = require('path');

const srcRoot = path.join(process.cwd(), 'node_modules', 'c2pa');
const publicRoot = path.join(process.cwd(), 'public', 'c2pa');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(rel) {
  const src = path.join(srcRoot, rel);
  if (fs.existsSync(src) && fs.statSync(src).isFile()) {
    const dst = path.join(publicRoot, path.basename(src));
    fs.copyFileSync(src, dst);
    console.log('Copied', rel, '→', path.relative(process.cwd(), dst));
    return true;
  }
  return false;
}

function tryPatterns(patterns) {
  let copied = 0;
  for (const p of patterns) if (copyIfExists(p)) copied++;
  return copied;
}

ensureDir(publicRoot);

// Try common asset locations used across c2pa versions
const candidates = [
  'dist/wasm/c2pa_wasm_bg.wasm',
  'dist/wasm/c2pa_wasm.wasm',
  'dist/worker/c2pa_worker.js',
  'dist/worker/worker.js',
  'dist/web/c2pa_wasm_bg.wasm',
  'dist/web/c2pa_worker.js',
];

let copied = tryPatterns(candidates);

if (copied === 0) {
  // Fallback: search recursively for plausible files
  function walk(dir) {
    let out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // skip huge trees that are irrelevant
        if (/node_modules\/.cache|test|__tests__/i.test(full)) continue;
        out = out.concat(walk(full));
      } else {
        out.push(full);
      }
    }
    return out;
  }
  if (fs.existsSync(srcRoot)) {
    const files = walk(srcRoot);
    const wasm = files.find((f) => /c2pa.*\.wasm$/i.test(f) || /_bg\.wasm$/i.test(f));
    const worker = files.find((f) => /c2pa.*worker.*\.js$/i.test(f) || /c2pa_worker\.js$/i.test(f));
    let any = 0;
    if (wasm) {
      fs.copyFileSync(wasm, path.join(publicRoot, path.basename(wasm)));
      console.log('Copied', path.relative(srcRoot, wasm));
      any++;
    }
    if (worker) {
      fs.copyFileSync(worker, path.join(publicRoot, path.basename(worker)));
      console.log('Copied', path.relative(srcRoot, worker));
      any++;
    }
    if (any === 0) {
      console.warn('No c2pa assets copied. Please check node_modules/c2pa for WASM/worker files.');
    }
  } else {
    console.warn('node_modules/c2pa not found. Skipping c2pa asset copy.');
  }
}

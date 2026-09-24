#!/usr/bin/env node
// One version for the whole repository.
//
// The version lives in five files: the root package.json, each workspace's
// package.json and apps/mobile/app.json (expo.version — what users see in the
// stores). A release tag that disagrees with any of them ships an artifact whose
// "About" string does not match its own release page, so the release workflow
// refuses it.
//
//   node tool/version.mjs get              print the version
//   node tool/version.mjs check [vX.Y.Z]   all files agree (and match the tag)
//   node tool/version.mjs set X.Y.Z        write X.Y.Z everywhere
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

const FILES = [
  { path: 'package.json', get: (j) => j.version, set: (j, v) => (j.version = v) },
  { path: 'packages/engine/package.json', get: (j) => j.version, set: (j, v) => (j.version = v) },
  { path: 'apps/server/package.json', get: (j) => j.version, set: (j, v) => (j.version = v) },
  { path: 'apps/mobile/package.json', get: (j) => j.version, set: (j, v) => (j.version = v) },
  { path: 'apps/mobile/app.json', get: (j) => j.expo.version, set: (j, v) => (j.expo.version = v) },
];

const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const write = (p, json) => writeFileSync(join(root, p), `${JSON.stringify(json, null, 2)}\n`);
const fail = (msg) => {
  console.error(process.env.GITHUB_ACTIONS ? `::error::${msg}` : `error: ${msg}`);
  process.exit(1);
};

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'get') {
  console.log(FILES[0].get(read(FILES[0].path)));
} else if (cmd === 'check') {
  const found = FILES.map((f) => ({ path: f.path, version: f.get(read(f.path)) }));
  const versions = new Set(found.map((f) => f.version));
  if (versions.size !== 1) {
    fail(
      `versions disagree:\n${found.map((f) => `  ${f.path}: ${f.version}`).join('\n')}\nRun: npm run version:set <x.y.z>`,
    );
  }
  const [version] = versions;
  if (!SEMVER.test(version)) fail(`version "${version}" is not x.y.z`);
  if (arg) {
    const tagVersion = arg.replace(/^v/, '');
    if (tagVersion !== version) fail(`tag ${arg} implies ${tagVersion} but the repository says ${version}`);
  }
  console.log(version);
} else if (cmd === 'set') {
  if (!arg || !SEMVER.test(arg)) fail('usage: node tool/version.mjs set X.Y.Z');
  for (const f of FILES) {
    const json = read(f.path);
    f.set(json, arg);
    write(f.path, json);
  }
  console.log(`version set to ${arg} in ${FILES.length} files`);
} else {
  fail('usage: node tool/version.mjs get | check [vX.Y.Z] | set X.Y.Z');
}

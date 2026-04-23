#!/usr/bin/env node
// Publish-from-dist: build each package, synthesize a clean package.json
// inside its dist/, copy LICENSE + README, then `npm publish` from dist/.
//
// Usage:
//   node scripts/publish.mjs                      # publish all packages
//   node scripts/publish.mjs packages/auth        # publish one
//   node scripts/publish.mjs --dry-run            # pack + lint, no publish
//
// Skips packages whose current version is already on npm, so re-running
// after a partial release is idempotent.

import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PACKAGES = [
  'packages/auth',
  'packages/chatgpt-provider',
  'packages/sessions',
];

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function isAlreadyPublished(name, version) {
  try {
    execSync(`npm view ${name}@${version} version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function publishPackage(pkgDir, { dryRun }) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const label = `${pkg.name}@${pkg.version}`;

  if (isAlreadyPublished(pkg.name, pkg.version)) {
    console.log(`\x1b[2m→ skip ${label} (already on npm)\x1b[0m`);
    return;
  }

  console.log(`\n\x1b[1m→ build ${label}\x1b[0m`);
  const distDir = join(pkgDir, 'dist');
  if (existsSync(distDir)) rmSync(distDir, { recursive: true });
  run('npm run build', pkgDir);

  // Synthesize a minimal package.json for the tarball.
  // Paths are relative to dist/, so main is just ./index.js.
  const publishPkg = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    main: './index.js',
    types: './index.d.ts',
    repository: pkg.repository,
    keywords: pkg.keywords,
    license: pkg.license,
    publishConfig: pkg.publishConfig,
  };
  if (pkg.dependencies) publishPkg.dependencies = pkg.dependencies;
  if (pkg.peerDependencies) publishPkg.peerDependencies = pkg.peerDependencies;

  writeFileSync(
    join(distDir, 'package.json'),
    JSON.stringify(publishPkg, null, 2) + '\n',
  );

  const repoLicense = join(REPO_ROOT, 'LICENSE');
  if (existsSync(repoLicense)) {
    copyFileSync(repoLicense, join(distDir, 'LICENSE'));
  }

  const pkgReadme = join(pkgDir, 'README.md');
  const repoReadme = join(REPO_ROOT, 'README.md');
  if (existsSync(pkgReadme)) {
    copyFileSync(pkgReadme, join(distDir, 'README.md'));
  } else if (existsSync(repoReadme)) {
    copyFileSync(repoReadme, join(distDir, 'README.md'));
  }

  console.log(`\x1b[1m→ publish ${label}${dryRun ? ' (dry run)' : ''}\x1b[0m`);
  run(`npm publish${dryRun ? ' --dry-run' : ''}`, distDir);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targets = args.filter((a) => !a.startsWith('--'));
const packages = targets.length > 0 ? targets : DEFAULT_PACKAGES;

for (const pkgDir of packages) {
  publishPackage(resolve(REPO_ROOT, pkgDir), { dryRun });
}

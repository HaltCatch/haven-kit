import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkLocalizationBundle } from './consumer/check-localization-bundle.mjs';
const root = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), 'haven-package-'));
const run = (command, args, cwd = scratch) =>
  execFileSync(
    command === 'pnpm'
      ? (process.env['npm_execpath'] ?? command)
      : command === 'node'
        ? process.execPath
        : command,
    args,
    { cwd, stdio: 'inherit' },
  );
try {
  for (const directory of ['packages/schema', 'packages/runtime', 'dist/ui'])
    run('pnpm', ['pack', '--pack-destination', scratch], resolve(root, directory));
  const notices = await readFile(resolve(root, 'dist/ui/THIRD_PARTY_NOTICES.md'), 'utf8');
  if (!notices.includes('Shu Ding') || !notices.includes('MAX ROVENSKY'))
    throw new Error('Glass attribution is missing');
  const archives = (await readdir(scratch)).filter((name) => name.endsWith('.tgz'));
  if (archives.length !== 3) throw new Error('Expected three package archives');
  const dependencies = Object.fromEntries(
    archives.map((name) => [`@haven/${name.split('-')[1]}`, `file:./${name}`]),
  );
  const project = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const name of [
    '@tanstack/angular-table',
    '@tanstack/angular-virtual',
    'quill',
    'dompurify',
    '@angular/core',
    '@angular/common',
    '@angular/forms',
    '@angular/cdk',
    '@angular/material',
    '@angular/compiler',
    '@angular/compiler-cli',
    'typescript',
    'rxjs',
    'sass',
    '@jsverse/transloco',
  ])
    dependencies[name] = project.devDependencies[name];
  await writeFile(
    join(scratch, 'package.json'),
    JSON.stringify({
      name: 'haven-isolated-consumer',
      private: true,
      type: 'module',
      dependencies,
    }),
  );
  await writeFile(
    join(scratch, 'pnpm-workspace.yaml'),
    'overrides:\n' +
      Object.entries(dependencies)
        .filter(([name]) => name.startsWith('@haven/'))
        .map(([name, value]) => `  '${name}': '${value}'`)
        .join('\n') +
      '\n',
  );
  await writeFile(join(scratch, '.npmrc'), 'registry=https://registry.npmjs.org/\n');
  const lockPath = resolve(root, 'tools/consumer/pnpm-lock.yaml');
  if (process.argv.includes('--update-lock')) {
    run('pnpm', ['install', '--lockfile-only', '--ignore-scripts', '--strict-peer-dependencies']);
    await writeFile(lockPath, await readFile(join(scratch, 'pnpm-lock.yaml')));
  } else {
    const lock = parse(await readFile(lockPath, 'utf8'));
    for (const archive of archives) {
      const name = `@haven/${archive.split('-')[1]}`;
      const entry = lock.packages[`${name}@file:${archive}`];
      if (!entry) throw new Error('Consumer lock needs updating: pnpm test:package:update-lock');
      entry.resolution.integrity =
        'sha512-' +
        createHash('sha512')
          .update(await readFile(join(scratch, archive)))
          .digest('base64');
    }
    await writeFile(join(scratch, 'pnpm-lock.yaml'), stringify(lock));
  }
  run('pnpm', [
    'install',
    '--frozen-lockfile',
    '--prefer-offline',
    '--ignore-scripts',
    '--strict-peer-dependencies',
  ]);
  await writeFile(
    join(scratch, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'preserve',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        outDir: './build',
      },
      angularCompilerOptions: { strictTemplates: true },
      files: ['consumer.ts'],
    }),
  );
  await writeFile(
    join(scratch, 'consumer.ts'),
    await readFile(resolve(root, 'tools/consumer/consumer.ts'), 'utf8'),
  );
  run('pnpm', ['exec', 'ngc', '-p', 'tsconfig.json']);
  await writeFile(
    join(scratch, 'node-check.mjs'),
    `import { validateDocument, localizeText as rootLocalizeText } from '@haven/schema';
import { isLocalizedText, localizeText } from '@haven/schema/localization';
import { compileCondition, buildTableHierarchy } from '@haven/runtime';
import { applyEditingBatch, documentFingerprint } from '@haven/runtime/editing';
import { captureEditingBatch } from '@haven/schema/editing';
const caption = { default: 'Fallback', translations: { 'en-US': 'Published caption' } };
if (!isLocalizedText(caption) || localizeText(caption, 'en-US') !== 'Published caption' || localizeText !== rootLocalizeText) throw new Error('Published localization entry failed');
if (validateDocument({}).valid) throw new Error('Invalid model accepted');
if (!compileCondition({ op: 'eq', left: { literal: 1 }, right: { literal: 1 } }).evaluate({ root: {} })) throw new Error('Rule failed');
const tree = buildTableHierarchy([{ id: 0, parent: null }, { id: '0', parent: 0 }], '/id', { parentPath: '/parent', rootValue: null });
if (tree.status !== 'ready' || tree.index.children.get(0)?.[0]?.id !== '0') throw new Error('Typed hierarchy failed');
const doc = { schemaVersion: '1.0', id: 'editing', title: 'Before', dataSchema: { type: 'object', properties: {} }, ui: { id: 'root', kind: 'form', version: 1 }, theme: { preset: 'material', mode: 'dark', density: 'comfortable' }, actions: {}, resources: {} };
const batch = { protocolVersion: '1.0', operationId: 'one', expected: { documentId: 'editing', sessionId: 'session', editRevision: 0 }, commands: [{ type: 'document.patch', patch: [{ op: 'replace', path: '/title', value: 'After' }] }] };
if (!captureEditingBatch(batch).ok) throw new Error('Published command schema rejected valid input');
const edited = applyEditingBatch({ document: doc, sessionId: 'session', editRevision: 0 }, batch, { requireValid: true });
if (!edited.ok || edited.document.title !== 'After' || edited.editRevision !== 1 || doc.title !== 'Before') throw new Error('Published atomic editing failed');
if (await documentFingerprint(doc) === await documentFingerprint(edited.document)) throw new Error('Published document fingerprint failed');
console.log('Pure packages and editing subpaths execute in Node; Angular consumer AOT compiled.');`,
  );
  run('node', ['node-check.mjs']);
  await checkLocalizationBundle(scratch);
  await writeFile(
    join(scratch, 'sass-check.mjs'),
    `import { compileString, NodePackageImporter } from 'sass'; import { resolve } from 'node:path'; const output = compileString('@use "pkg:@haven/ui/theme/styles" as haven; html { @include haven.theme(); }', { importers: [new NodePackageImporter(import.meta.dirname)], loadPaths: [resolve('node_modules')] }); if (!output.css.includes('--haven-spacing')) throw new Error('Theme styles are missing'); console.log('Published Sass entry compiles with Material.');`,
  );
  run('node', ['sass-check.mjs']);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

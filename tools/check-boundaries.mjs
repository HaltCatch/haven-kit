import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const banned =
  /@digiwin\/|\bDpp[A-Z]\w*|GUID\$|CLASSNAME\$|CUSTOMFIELD\$|new\s+Function\s*\(|\beval\s*\(/;
async function check(directory, pure = false) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await check(path, pure);
      continue;
    }
    if (!/\.(ts|js|mjs|scss|json)$/.test(entry.name)) continue;
    const text = await readFile(path, 'utf8');
    if (banned.test(text))
      throw new Error(`Disallowed runtime dependency or executable expression: ${path}`);
    if (/from\s+['"]react(?:-dom)?(?:\/[^'"]*)?['"]/.test(text))
      throw new Error(`React runtime must not enter Haven: ${path}`);
    if (pure && /from\s+['"]@angular\/|import\s*\(['"]@angular\//.test(text))
      throw new Error(`Framework import in pure package: ${path}`);
  }
}
await check('packages/schema', true);
await check('packages/runtime', true);
await check('packages/ui');
await check('dist/ui');
console.log('Package boundaries and business-independence scan passed.');

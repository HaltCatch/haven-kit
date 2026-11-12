import { readFile, mkdir, writeFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import standalone from 'ajv/dist/standalone/index.js';
import { build } from 'esbuild';
import { format, resolveConfig } from 'prettier';
import { fileURLToPath, URL } from 'node:url';
const schema = JSON.parse(
  await readFile(new URL('../packages/schema/document.schema.json', import.meta.url), 'utf8'),
);
import { editingSchema } from './schema/editing-schema.mjs';
const editing = editingSchema(schema);
const editingPath = new URL('../packages/schema/editing.schema.json', import.meta.url);
await writeChanged(
  editingPath,
  await format(JSON.stringify(editing), {
    ...(await resolveConfig(fileURLToPath(editingPath))),
    filepath: fileURLToPath(editingPath),
  }),
);
for (const [name, source] of [
  ['validate', schema],
  ['validate-editing', editing],
]) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
    code: { source: true, esm: true, lines: true },
  });
  const validate = ajv.compile(source);
  const out = new URL('../packages/schema/src/generated/', import.meta.url);
  await mkdir(out, { recursive: true });
  const bundled = await build({
    stdin: {
      contents: standalone(ajv, validate),
      resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  await writeChanged(new URL(`${name}.js`, out), bundled.outputFiles[0].text);
  await writeChanged(
    new URL(`${name}.d.ts`, out),
    `declare const validate: { (value: unknown): boolean; errors?: { instancePath: string; keyword: string; message?: string }[] | null };\nexport default validate;\n`,
  );
}

async function writeChanged(path, value) {
  try {
    if ((await readFile(path, 'utf8')) === value) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(path, value);
}

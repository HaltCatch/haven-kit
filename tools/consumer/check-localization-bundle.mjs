import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Bundle actual installed tarballs, with the existing workspace build tool and no source aliases. */
export async function checkLocalizationBundle(consumer) {
  const directory = join(consumer, 'localization-bundle-check');
  await mkdir(directory, { recursive: true });
  const main = join(directory, 'main.js'),
    validation = join(directory, 'validation.js');
  await writeFile(
    validation,
    "export { validateDocument, isTableVirtualization } from '@haven/schema';\n",
  );
  const profiles = {
    schema:
      "import { localizeText } from '@haven/schema/localization'; globalThis.caption = localizeText('Caption', 'en-US');",
    i18n: "import { provideHavenTransloco } from '@haven/ui/i18n'; globalThis.localizationProvider = provideHavenTransloco;",
  };
  for (const [profile, source] of Object.entries(profiles)) {
    await writeFile(
      main,
      source + "\nglobalThis.openValidation = () => import('./validation.js');\n",
    );
    const { metafile } = await build({
      absWorkingDir: consumer,
      entryPoints: [main, validation],
      outdir: join(directory, profile),
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2023',
      minify: true,
      metafile: true,
      write: false,
    });
    const outputs = metafile.outputs,
      entry = Object.keys(outputs).find(
        (path) => outputs[path].entryPoint && resolve(consumer, outputs[path].entryPoint) === main,
      );
    if (!entry) throw new Error(`Missing localization bundle entry: ${profile}`);
    const initial = new Set();
    const visit = (path) => {
      if (initial.has(path)) return;
      initial.add(path);
      for (const dependency of outputs[path].imports) {
        if (dependency.kind === 'dynamic-import') continue;
        if (dependency.external || !outputs[dependency.path])
          throw new Error(`Unaccounted initial dependency: ${dependency.path}`);
        visit(dependency.path);
      }
    };
    visit(entry);
    const included = (path) =>
      Object.entries(outputs[path].inputs)
        .filter(([, value]) => value.bytesInOutput > 0)
        .map(([name]) => name);
    const inputs = [...initial].flatMap(included);
    if (!inputs.some((path) => path.endsWith('/@haven/schema/dist/localization.js')))
      throw new Error(`The published localization entry was not consumed: ${profile}`);
    if (
      inputs.some((path) =>
        /\/@haven\/schema\/dist\/(?:generated\/validate|validate|catalog)\.js$/.test(path),
      )
    )
      throw new Error(`Document validation leaked into the initial ${profile} bundle`);
    // Prove validation was retained lazily, rather than omitted to make the initial check pass.
    if (
      !Object.keys(outputs)
        .filter((path) => !initial.has(path))
        .flatMap(included)
        .some((path) => path.endsWith('/@haven/schema/dist/generated/validate.js'))
    )
      throw new Error(`Lazy document validation was not retained: ${profile}`);
    const bytes = [...initial].reduce((total, path) => total + outputs[path].bytes, 0);
    console.log(
      `Published ${profile} initial static closure: ${bytes} bytes; document validation remains lazy.`,
    );
  }
}

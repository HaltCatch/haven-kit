import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Isolate native Firefox app data, separately from Playwright's temporary profile.
 * Mozilla supports these overrides for command-line launches on macOS 27:
 * https://bugzilla.mozilla.org/show_bug.cgi?id=2068208
 * https://bugzilla.mozilla.org/show_bug.cgi?id=2078511
 */
export default async function firefoxEnvironment() {
  if (process.platform !== 'darwin') return;
  const directories = {
    MOZ_APP_DATA: 'AppData',
    MOZ_LOCAL_APP_DATA: 'LocalAppData',
  } as const;
  const missing = Object.entries(directories).filter(([key]) => process.env[key] === undefined);
  if (!missing.length) return;
  const root = await mkdtemp(join(tmpdir(), 'haven-playwright-firefox-'));
  const cleanup = async () => {
    try {
      await rm(root, { recursive: true, force: true });
    } finally {
      // Only unset values introduced here; explicit caller overrides are never changed.
      for (const [key] of missing) delete process.env[key];
    }
  };
  try {
    for (const [key, directory] of missing) {
      const path = join(root, directory);
      await mkdir(path);
      process.env[key] = path;
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}

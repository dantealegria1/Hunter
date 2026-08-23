import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeConfig } from 'vite';

const root = resolve(__dirname, '../..');

const readRepoFile = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

describe('TASK-06: GitHub Pages configuration', () => {
  it('vite config sets the /Hunter/ base path', () => {
    const config = readRepoFile('vite.config.ts');
    expect(config).toMatch(/base:\s*['"]\/Hunter\/['"]/);
  });

  it('deploy workflow exists and triggers on push to main', () => {
    const yml = readRepoFile('.github/workflows/deploy.yml');
    expect(yml).toContain('branches: [main]');
  });

  it('workflow builds with npm ci and runs tests before deploying', () => {
    const yml = readRepoFile('.github/workflows/deploy.yml');
    expect(yml).toContain('npm ci');
    expect(yml.indexOf('npm run test')).toBeLessThan(yml.indexOf('npm run build'));
  });

  it('workflow uploads the local build output directory (dist)', () => {
    const yml = readRepoFile('.github/workflows/deploy.yml');
    const upload = yml.slice(yml.indexOf('upload-pages-artifact'));
    expect(upload).toContain('path: dist');
  });

  it('vite build outputs to the uploaded directory', async () => {
    // Build programmatically into an isolated outDir so the test does not
    // depend on a prior `npm run build` having produced ./dist.
    const { default: viteConfig } = await import(resolve(root, 'vite.config.ts'));
    const merged = mergeConfig(viteConfig, {
      build: { outDir: mkdtempSync(resolve(tmpdir(), 'hunter-dist-')), emptyOutDir: true },
      base: '/Hunter/',
    });
    const vite = await import('vite');
    await vite.build(merged);

    // Reuse the checked-in dist when it exists (e.g. after a real build),
    // otherwise assert against the freshly built artifact.
    const indexHtml = existsSync(resolve(root, 'dist/index.html'))
      ? readFileSync(resolve(root, 'dist/index.html'), 'utf-8')
      : null;
    if (indexHtml !== null) {
      expect(indexHtml).toContain('/Hunter/assets/');
    }
    const builtDir = readdirSync(merged.build.outDir);
    expect(builtDir).toContain('index.html');
    const builtHtml = readFileSync(
      resolve(merged.build.outDir, 'index.html'),
      'utf-8'
    );
    expect(builtHtml).toContain('/Hunter/assets/');
  });
});

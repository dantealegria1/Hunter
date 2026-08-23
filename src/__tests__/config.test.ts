import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('vite build outputs to the uploaded directory', () => {
    // default Vite outDir is `dist` relative to project root
    expect(readFileSync(resolve(root, 'dist/index.html'), 'utf-8')).toContain(
      '/Hunter/assets/'
    );
  });
});

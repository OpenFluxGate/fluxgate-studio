import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Resolve from the actual consumer, not an unrelated top-level minimatch.
const require = createRequire(import.meta.url);
const consumerRequire = createRequire(
  require.resolve('@typescript-eslint/typescript-estree/package.json')
);
const { minimatch } = consumerRequire('minimatch') as {
  minimatch: (path: string, pattern: string, options: { dot: boolean }) => boolean;
};

describe('typescript-estree scoped minimatch security override', () => {
  it('uses the reviewed patched version and named CommonJS API', () => {
    expect(consumerRequire('minimatch/package.json').version).toBe('11.0.1');
    expect(typeof minimatch).toBe('function');
  });

  it.each([
    ['eslint.config.mjs', '*.mjs', true],
    ['.config.ts', '*.ts', true],
    ['src/test.ts', '*.ts', false],
    ['src/a.ts', 'src/**/*.ts', true],
    ['src/nested/a.ts', 'src/**/*.ts', true],
    ['src/a.js', 'src/**/*.ts', false],
    ['config.mjs', '*.{js,mjs}', true],
    ['config.ts', '*.?(m)js', false],
    ['config.mjs', '*.?(m)js', true],
  ])('matches %s against %s using the consumer options', (path, pattern, expected) => {
    expect(minimatch(path, pattern, { dot: true })).toBe(expected);
  });
});

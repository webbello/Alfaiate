import { describe, expect, it } from 'vitest';

// SEC-05, AC-15: no log line may carry customer data, so every `console.*` call in the application must use a constant string.
const CALL = /console\.\w+\(([^)]*)\)/g;
const CONSTANT = /^\s*(['"`])[^'"`$\\]*\1\s*$/;
export const dynamicCalls = (source: string): string[] =>
  [...source.matchAll(CALL)]
    .filter((m) => !CONSTANT.test(m[1]))
    .map((m) => m[0]);

describe('the checker itself', () => {
  it('accepts constant messages and flags anything built from data', () => {
    expect(dynamicCalls("console.error('owner notification failed')")).toEqual(
      [],
    );
    expect(dynamicCalls('console.error("failed")')).toEqual([]);
    for (const bad of [
      'console.log(name)',
      'console.log(`hello ${name}`)',
      "console.error('x', error)",
      "console.warn('a' + b)",
      'console.info(JSON.stringify(row))',
    ])
      expect(dynamicCalls(bad), bad).toHaveLength(1);
  });
});

describe('the whole application tree', () => {
  const files = import.meta.glob(
    ['../../src/**/*.ts', '../../src/**/*.astro'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>;

  it('reads the real source files (the glob is not empty)', () => {
    expect(Object.keys(files).length).toBeGreaterThan(100);
  });

  it('has only constant console calls', () => {
    for (const [path, source] of Object.entries(files))
      expect(dynamicCalls(source), path).toEqual([]);
  });
});

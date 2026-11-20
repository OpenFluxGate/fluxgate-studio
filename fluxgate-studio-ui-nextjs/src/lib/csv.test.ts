import { describe, expect, it } from 'vitest';

import { toCsv } from './csv';

describe('toCsv', () => {
  it('quotes cells that need it', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['x,y', 'say "hi"'],
          ['line\nbreak', 3],
        ]
      )
    ).toBe('a,b\n"x,y","say ""hi"""\n"line\nbreak",3\n');
  });

  it('writes empty cells for missing values', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\n,\n');
  });

  it('defuses text that a spreadsheet would run as a formula', () => {
    expect(toCsv(['a'], [['=SUM(A1)'], ['+1'], [-5]])).toBe("a\n'=SUM(A1)\n'+1\n-5\n");
  });
});

import { describe, expect, it } from 'vitest';

import { clusterAnnotations } from './charts';

const note = (time: number) => ({ time, text: `change ${time}` });

describe('annotation markers', () => {
  it('groups annotations that would overlap on screen', () => {
    const clusters = clusterAnnotations([
      { x: 100, note: note(3) },
      { x: 10, note: note(1) },
      { x: 18, note: note(2) },
      { x: 40, note: note(4) },
    ]);

    expect(clusters.map((cluster) => [cluster.x, cluster.notes.map((item) => item.time)])).toEqual([
      [10, [1, 2]],
      [40, [4]],
      [100, [3]],
    ]);
  });

  it('keeps markers apart once they are at least the gap away', () => {
    expect(
      clusterAnnotations([
        { x: 0, note: note(1) },
        { x: 12, note: note(2) },
      ])
    ).toHaveLength(2);
  });
});

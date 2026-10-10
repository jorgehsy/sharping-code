import { describe, expect, it } from 'vitest';
import { parseBlocks } from './markdown.tsx';

describe('parseBlocks', () => {
  it('parses headings, paragraphs, lists and fences', () => {
    const md = '# Title\n\nFirst line\nsecond line\n\n- a\n- b\n\n```\ncode here\n```\nafter';
    expect(parseBlocks(md)).toEqual([
      { kind: 'heading', text: 'Title' },
      { kind: 'para', text: 'First line second line' },
      { kind: 'list', items: ['a', 'b'] },
      { kind: 'code', text: 'code here' },
      { kind: 'para', text: 'after' },
    ]);
  });
});

import type { ReactNode } from 'react';

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'para'; text: string };

/** Markdown-lite: headings, fenced code, bullet lists, paragraphs. Inline `code` and **bold** in the renderer. */
export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') });
    if (list.length) blocks.push({ kind: 'list', items: list });
    para = [];
    list = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) code.push(lines[i]!);
      blocks.push({ kind: 'code', text: code.join('\n') });
    } else if (/^#{1,6}\s/.test(line)) {
      flush();
      blocks.push({ kind: 'heading', text: line.replace(/^#+\s+/, '') });
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (para.length) flush();
      list.push(line.replace(/^\s*[-*]\s+/, ''));
    } else if (!line.trim()) flush();
    else {
      if (list.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="md">
      {parseBlocks(source).map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <h3 key={i}>{inline(b.text)}</h3>;
          case 'code':
            return <pre key={i}>{b.text}</pre>;
          case 'list':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it)}</li>
                ))}
              </ul>
            );
          default:
            return <p key={i}>{inline(b.text)}</p>;
        }
      })}
    </div>
  );
}

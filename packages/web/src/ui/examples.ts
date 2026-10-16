/** Parameter names of a `function solve(a: T, b: U): R` signature. Splits on top-level commas only (types can nest). */
export function paramNames(signature: string): string[] {
  const open = signature.indexOf('(');
  if (open < 0) return [];
  let depth = 0;
  let current = '';
  const params: string[] = [];
  let prev = '';
  for (const ch of signature.slice(open + 1)) {
    if (depth === 0 && ch === ')') break;
    if ('([{<'.includes(ch)) depth++;
    else if (')]}'.includes(ch) || (ch === '>' && prev !== '=')) depth--;
    prev = ch;
    if (depth === 0 && ch === ',') {
      params.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) params.push(current);
  return params.map((p) => p.split(':')[0]!.replace(/[?.]/g, '').trim());
}

/** JSON with a space after commas, so long arrays wrap between items instead of mid-token. */
export function formatValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (v !== null && typeof v === 'object')
    return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${formatValue(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}

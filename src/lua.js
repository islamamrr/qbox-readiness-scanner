// Minimal Lua tokenizer: enough for fxmanifest parsing and comment stripping.
// Handles CfxLua extras (backtick hashes, compound operators) by treating them
// as opaque punctuation, so unusual syntax never throws.

/**
 * @typedef {{type: 'name'|'string'|'number'|'punct'|'comment', value: string, line: number, start: number, end: number}} Token
 */

const LONG_BRACKET = /^\[(=*)\[/;

/**
 * @param {string} src
 * @returns {Token[]}
 */
export function tokenize(src) {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  const countLines = (from, to) => {
    for (let k = from; k < to; k++) if (src.charCodeAt(k) === 10) line++;
  };

  while (i < n) {
    const c = src[i];

    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }

    const startLine = line;
    const start = i;

    // Comments
    if (c === '-' && src[i + 1] === '-') {
      const m = LONG_BRACKET.exec(src.slice(i + 2, i + 2 + 64));
      if (m) {
        const close = ']' + m[1] + ']';
        const endIdx = src.indexOf(close, i + 2 + m[0].length);
        const stop = endIdx === -1 ? n : endIdx + close.length;
        countLines(i, stop);
        tokens.push({ type: 'comment', value: src.slice(i, stop), line: startLine, start, end: stop });
        i = stop;
        continue;
      }
      let stop = src.indexOf('\n', i);
      if (stop === -1) stop = n;
      tokens.push({ type: 'comment', value: src.slice(i, stop), line: startLine, start, end: stop });
      i = stop;
      continue;
    }

    // Long strings
    if (c === '[') {
      const m = LONG_BRACKET.exec(src.slice(i, i + 64));
      if (m) {
        const close = ']' + m[1] + ']';
        const endIdx = src.indexOf(close, i + m[0].length);
        const stop = endIdx === -1 ? n : endIdx + close.length;
        const value = src.slice(i + m[0].length, endIdx === -1 ? n : endIdx).replace(/^\r?\n/, '');
        countLines(i, stop);
        tokens.push({ type: 'string', value, line: startLine, start, end: stop });
        i = stop;
        continue;
      }
    }

    // Quoted strings (and CfxLua backtick hash literals)
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let value = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < n) {
          const e = src[j + 1];
          value += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          if (e === '\n') line++;
          j += 2;
          continue;
        }
        if (src[j] === '\n') break; // unterminated: stop at line end
        value += src[j];
        j++;
      }
      const stop = j < n && src[j] === c ? j + 1 : j;
      tokens.push({ type: c === '`' ? 'punct' : 'string', value: c === '`' ? src.slice(i, stop) : value, line: startLine, start, end: stop });
      i = stop;
      continue;
    }

    // Names
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'name', value: src.slice(i, j), line: startLine, start, end: j });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[0-9A-Za-z_.]/.test(src[j])) {
        if ((src[j] === 'e' || src[j] === 'E' || src[j] === 'p' || src[j] === 'P') && (src[j + 1] === '-' || src[j + 1] === '+')) j++;
        j++;
      }
      tokens.push({ type: 'number', value: src.slice(i, j), line: startLine, start, end: j });
      i = j;
      continue;
    }

    // Punctuation (multi-char first)
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    let p = c;
    if (three === '...') p = three;
    else if (['==', '~=', '<=', '>=', '..', '::', '//', '<<', '>>', '+=', '-=', '*=', '/=', '?.'].includes(two)) p = two;
    tokens.push({ type: 'punct', value: p, line: startLine, start, end: i + p.length });
    i += p.length;
  }
  return tokens;
}

/**
 * Replace comments with spaces (newlines kept) so regex scans keep line numbers.
 * @param {string} src
 */
export function stripLuaComments(src) {
  const tokens = tokenize(src);
  let out = '';
  let last = 0;
  for (const t of tokens) {
    if (t.type !== 'comment') continue;
    out += src.slice(last, t.start) + src.slice(t.start, t.end).replace(/[^\n]/g, ' ');
    last = t.end;
  }
  return out + src.slice(last);
}

/**
 * Crude JS comment stripper that keeps line numbers (good enough for pattern scans).
 * @param {string} src
 */
export function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
}

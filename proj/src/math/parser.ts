import type { Op, Token } from './tokenizer';

export type Node =
  | { kind: 'num'; text: string }
  | { kind: 'neg'; operand: Node }
  | { kind: 'bin'; op: Op; left: Node; right: Node };

export type ParseResult = { ok: true; ast: Node } | { ok: false; message: string };

class ParseError extends Error {}

const describe = (t: Token): string =>
  t.type === 'num' ? t.text : t.type === 'op' ? t.op : t.type === 'lparen' ? '(' : t.type === 'rparen' ? ')' : '=';

/**
 * Recursive-descent parser. Precedence (low to high):
 *   expr    := term (('+' | '−') term)*      left-associative
 *   term    := unary (('×' | '÷') unary)*    left-associative
 *   unary   := ('+' | '−') unary | primary   negative numbers
 *   primary := number | '(' expr ')'
 */
export function parse(tokens: Token[]): ParseResult {
  let pos = 0;

  const matchOp = (...ops: Op[]): Op | null => {
    const t: Token | undefined = tokens[pos];
    if (t && t.type === 'op' && ops.includes(t.op)) {
      pos++;
      return t.op;
    }
    return null;
  };

  function expr(): Node {
    let left = term();
    for (let op = matchOp('+', '−'); op; op = matchOp('+', '−')) {
      left = { kind: 'bin', op, left, right: term() };
    }
    return left;
  }

  function term(): Node {
    let left = unary();
    for (let op = matchOp('×', '÷'); op; op = matchOp('×', '÷')) {
      left = { kind: 'bin', op, left, right: unary() };
    }
    return left;
  }

  function unary(): Node {
    const op = matchOp('+', '−');
    if (op === '−') return { kind: 'neg', operand: unary() };
    if (op === '+') return unary();
    return primary();
  }

  function primary(): Node {
    const t: Token | undefined = tokens[pos++];
    if (!t) throw new ParseError('Expression ended unexpectedly');
    if (t.type === 'num') return { kind: 'num', text: t.text };
    if (t.type === 'lparen') {
      const inner = expr();
      if (tokens[pos]?.type !== 'rparen') throw new ParseError("Missing ')'");
      pos++;
      return inner;
    }
    throw new ParseError(`Unexpected '${describe(t)}'`);
  }

  try {
    const ast = expr();
    const rest: Token | undefined = tokens[pos];
    if (rest) throw new ParseError(`Unexpected '${describe(rest)}'`);
    return { ok: true, ast };
  } catch (e) {
    // Includes stack overflow on absurdly nested input: always return, never throw.
    return { ok: false, message: e instanceof ParseError ? e.message : 'Could not parse expression' };
  }
}
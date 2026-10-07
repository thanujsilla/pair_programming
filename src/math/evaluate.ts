import Decimal from 'decimal.js';
import { parse, type Node } from './parser';
import { tokenize } from './tokenizer';
import type { EvalResult } from './types';

// Own Decimal class so we never touch the library's global settings.
const D = Decimal.clone({ precision: 40 });

/** Returns null when the result is undefined (division by zero). */
function compute(node: Node): Decimal | null {
  switch (node.kind) {
    case 'num':
      return new D(node.text);
    case 'neg': {
      const v = compute(node.operand);
      return v && v.neg();
    }
    case 'bin': {
      const l = compute(node.left);
      const r = compute(node.right);
      if (!l || !r) return null;
      switch (node.op) {
        case '+':
          return l.plus(r);
        case '−':
          return l.minus(r);
        case '×':
          return l.times(r);
        case '÷':
          return r.isZero() ? null : l.div(r);
      }
    }
  }
}

/** Round to 10 decimal places, drop trailing zeros, no "-0". */
function format(v: Decimal): string {
  const r = v.toDecimalPlaces(10);
  if (r.isZero()) return '0';
  return r.abs().gte('1e21') ? r.toExponential() : r.toFixed();
}

/**
 * Evaluate one line such as "18+4×3=". Needs a terminal "=".
 * Always returns a result; it never throws.
 */
export function evaluateLine(text: string): EvalResult {
  try {
    const lexed = tokenize(text);
    if (!lexed.ok) return { status: 'error', message: lexed.message };

    const { tokens } = lexed;
    const last = tokens[tokens.length - 1];
    if (!last || last.type !== 'equals') return { status: 'incomplete' };

    const body = tokens.slice(0, -1);
    if (body.length === 0) return { status: 'incomplete' };
    if (body.some((t) => t.type === 'equals')) {
      return { status: 'error', message: 'Only one "=" is allowed' };
    }

    const parsed = parse(body);
    if (!parsed.ok) return { status: 'error', message: parsed.message };

    const value = compute(parsed.ast);
    return value === null ? { status: 'undefined' } : { status: 'ok', value: format(value) };
  } catch {
    return { status: 'error', message: 'Could not evaluate expression' };
  }
}
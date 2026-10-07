/** Result of evaluating one line of handwriting. Never thrown, always returned. */
export type EvalResult =
  | { status: 'ok'; value: string }
  | { status: 'undefined' } // division by zero
  | { status: 'incomplete' } // no terminal "=" yet (user still writing)
  | { status: 'error'; message: string }; // malformed input
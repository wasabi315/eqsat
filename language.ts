import { Map } from "immutable";

export type Term = { op: string; children: ReadonlyArray<Term> };

export type Pattern =
  | { tag: "var"; name: string }
  | { tag: "node"; op: string; children: ReadonlyArray<Pattern> };

export type Substitution<T> = Map<string, T>;

/**
 * Pretty-print a Term as an S-expression.
 *
 * Examples:
 * - { op: "a", children: [] } → "a"
 * - { op: "+", children: [a, b] } → "(+ a b)"
 */
export function printTerm(term: Term): string {
  if (term.children.length === 0) {
    return term.op;
  }

  const childrenStr = term.children.map(printTerm).join(" ");
  return `(${term.op} ${childrenStr})`;
}

/**
 * Pretty-print a Pattern as an S-expression.
 * Variables are prefixed with "?" to distinguish them from operators.
 *
 * Examples:
 * - { tag: "var", name: "x" } → "?x"
 * - { tag: "node", op: "+", children: [var(x), var(y)] } → "(+ ?x ?y)"
 */
export function printPattern(pattern: Pattern): string {
  switch (pattern.tag) {
    case "var":
      return `?${pattern.name}`;
    case "node": {
      if (pattern.children.length === 0) {
        return pattern.op;
      }
      const childrenStr = pattern.children.map(printPattern).join(" ");
      return `(${pattern.op} ${childrenStr})`;
    }
  }
}

type Sexp = string | Sexp[];

function tokenize(input: string): string[] {
  return input.match(/[()]|[^\s()]+/g) ?? [];
}

function parseSexp(tokens: string[], pos: number): [Sexp, number] {
  if (pos >= tokens.length) {
    throw new Error("Unexpected end of input");
  }

  const token = tokens[pos];

  if (token === ")") {
    throw new Error("Unexpected ')'");
  }

  if (token !== "(") {
    return [token, pos + 1];
  }

  const list: Sexp[] = [];
  let i = pos + 1;

  while (i < tokens.length && tokens[i] !== ")") {
    const [elem, next] = parseSexp(tokens, i);
    list.push(elem);
    i = next;
  }

  if (i >= tokens.length) {
    throw new Error("Expected ')'");
  }

  return [list, i + 1];
}

function sexpToTerm(sexp: Sexp): Term {
  if (typeof sexp === "string") {
    return { op: sexp, children: [] };
  }

  if (sexp.length === 0) {
    throw new Error("Expected operator after '('");
  }

  const [head, ...tail] = sexp;

  if (typeof head !== "string") {
    throw new Error("Operator must be an atom");
  }

  return { op: head, children: tail.map(sexpToTerm) };
}

function sexpToPattern(sexp: Sexp): Pattern {
  if (typeof sexp === "string") {
    return sexp.startsWith("?")
      ? { tag: "var", name: sexp.slice(1) }
      : { tag: "node", op: sexp, children: [] };
  }

  if (sexp.length === 0) {
    throw new Error("Expected operator after '('");
  }

  const [head, ...tail] = sexp;

  if (typeof head !== "string") {
    throw new Error("Operator must be an atom");
  }

  return { tag: "node", op: head, children: tail.map(sexpToPattern) };
}

/**
 * Parse an S-expression string into a Term.
 *
 * Examples:
 * - "a" → { op: "a", children: [] }
 * - "(+ a b)" → { op: "+", children: [{ op: "a", children: [] }, { op: "b", children: [] }] }
 */
export function parseTerm(input: string): Term {
  const tokens = tokenize(input);
  const [sexp, pos] = parseSexp(tokens, 0);
  if (pos < tokens.length) {
    throw new Error(`Unexpected tokens: ${tokens.slice(pos).join(" ")}`);
  }
  return sexpToTerm(sexp);
}

/**
 * Parse an S-expression string into a Pattern.
 * Tokens starting with "?" are parsed as variables.
 *
 * Examples:
 * - "?x" → { tag: "var", name: "x" }
 * - "(+ ?x ?y)" → { tag: "node", op: "+", children: [{ tag: "var", name: "x" }, { tag: "var", name: "y" }] }
 */
export function parsePattern(input: string): Pattern {
  const tokens = tokenize(input);
  const [sexp, pos] = parseSexp(tokens, 0);
  if (pos < tokens.length) {
    throw new Error(`Unexpected tokens: ${tokens.slice(pos).join(" ")}`);
  }
  return sexpToPattern(sexp);
}

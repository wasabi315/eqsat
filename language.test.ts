import { assertEquals, assertThrows } from "@std/assert";
import {
  parsePattern,
  parseTerm,
  printPattern,
  printTerm,
  type Pattern,
  type Term,
} from "./language.ts";

// parseTerm tests

Deno.test("parseTerm - atom", () => {
  const result = parseTerm("a");
  assertEquals(result, { op: "a", children: [] });
});

Deno.test("parseTerm - simple expression", () => {
  const result = parseTerm("(+ a b)");
  assertEquals(result, {
    op: "+",
    children: [
      { op: "a", children: [] },
      { op: "b", children: [] },
    ],
  });
});

Deno.test("parseTerm - nested expression", () => {
  const result = parseTerm("(* (+ a b) c)");
  assertEquals(result, {
    op: "*",
    children: [
      {
        op: "+",
        children: [
          { op: "a", children: [] },
          { op: "b", children: [] },
        ],
      },
      { op: "c", children: [] },
    ],
  });
});

Deno.test("parseTerm - deeply nested", () => {
  const result = parseTerm("(f (g (h x)))");
  assertEquals(result, {
    op: "f",
    children: [
      {
        op: "g",
        children: [
          {
            op: "h",
            children: [{ op: "x", children: [] }],
          },
        ],
      },
    ],
  });
});

Deno.test("parseTerm - multiple children", () => {
  const result = parseTerm("(f a b c d)");
  assertEquals(result, {
    op: "f",
    children: [
      { op: "a", children: [] },
      { op: "b", children: [] },
      { op: "c", children: [] },
      { op: "d", children: [] },
    ],
  });
});

Deno.test("parseTerm - extra whitespace", () => {
  const result = parseTerm("  ( +   a    b )  ");
  assertEquals(result, {
    op: "+",
    children: [
      { op: "a", children: [] },
      { op: "b", children: [] },
    ],
  });
});

Deno.test("parseTerm - error on empty input", () => {
  assertThrows(() => parseTerm(""), Error, "Unexpected end of input");
});

Deno.test("parseTerm - error on unexpected )", () => {
  assertThrows(() => parseTerm(")"), Error, "Unexpected ')'");
});

Deno.test("parseTerm - error on trailing tokens", () => {
  assertThrows(() => parseTerm("a b"), Error, "Unexpected tokens");
});

Deno.test("parseTerm - error on empty list", () => {
  assertThrows(() => parseTerm("()"), Error, "Expected operator after '('");
});

// parsePattern tests

Deno.test("parsePattern - variable", () => {
  const result = parsePattern("?x");
  assertEquals(result, { tag: "var", name: "x" });
});

Deno.test("parsePattern - atom", () => {
  const result = parsePattern("a");
  assertEquals(result, { tag: "node", op: "a", children: [] });
});

Deno.test("parsePattern - simple expression with variables", () => {
  const result = parsePattern("(+ ?x ?y)");
  assertEquals(result, {
    tag: "node",
    op: "+",
    children: [
      { tag: "var", name: "x" },
      { tag: "var", name: "y" },
    ],
  });
});

Deno.test("parsePattern - mixed variables and atoms", () => {
  const result = parsePattern("(+ ?x 1)");
  assertEquals(result, {
    tag: "node",
    op: "+",
    children: [
      { tag: "var", name: "x" },
      { tag: "node", op: "1", children: [] },
    ],
  });
});

Deno.test("parsePattern - nested expression", () => {
  const result = parsePattern("(* (+ ?a ?b) ?c)");
  assertEquals(result, {
    tag: "node",
    op: "*",
    children: [
      {
        tag: "node",
        op: "+",
        children: [
          { tag: "var", name: "a" },
          { tag: "var", name: "b" },
        ],
      },
      { tag: "var", name: "c" },
    ],
  });
});

Deno.test("parsePattern - error on empty input", () => {
  assertThrows(() => parsePattern(""), Error, "Unexpected end of input");
});

Deno.test("parsePattern - error on trailing tokens", () => {
  assertThrows(() => parsePattern("?x ?y"), Error, "Unexpected tokens");
});

// Round-trip tests

Deno.test("parseTerm/printTerm - round trip atom", () => {
  const input = "a";
  assertEquals(printTerm(parseTerm(input)), input);
});

Deno.test("parseTerm/printTerm - round trip expression", () => {
  const input = "(+ a b)";
  assertEquals(printTerm(parseTerm(input)), input);
});

Deno.test("parseTerm/printTerm - round trip nested", () => {
  const input = "(* (+ a b) c)";
  assertEquals(printTerm(parseTerm(input)), input);
});

Deno.test("parsePattern/printPattern - round trip variable", () => {
  const input = "?x";
  assertEquals(printPattern(parsePattern(input)), input);
});

Deno.test("parsePattern/printPattern - round trip expression", () => {
  const input = "(+ ?x ?y)";
  assertEquals(printPattern(parsePattern(input)), input);
});

Deno.test("parsePattern/printPattern - round trip nested", () => {
  const input = "(* (+ ?a ?b) ?c)";
  assertEquals(printPattern(parsePattern(input)), input);
});

Deno.test("printTerm/parseTerm - round trip", () => {
  const term: Term = {
    op: "*",
    children: [
      {
        op: "+",
        children: [
          { op: "a", children: [] },
          { op: "b", children: [] },
        ],
      },
      { op: "c", children: [] },
    ],
  };
  assertEquals(parseTerm(printTerm(term)), term);
});

Deno.test("printPattern/parsePattern - round trip", () => {
  const pattern: Pattern = {
    tag: "node",
    op: "*",
    children: [
      {
        tag: "node",
        op: "+",
        children: [
          { tag: "var", name: "a" },
          { tag: "var", name: "b" },
        ],
      },
      { tag: "var", name: "c" },
    ],
  };
  assertEquals(parsePattern(printPattern(pattern)), pattern);
});

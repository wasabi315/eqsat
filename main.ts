import { EGraph } from "./egraph.ts";
import { Pattern, printTerm, parsePattern, parseTerm } from "./language.ts";

function main() {
  const term = parseTerm("(/ (* a 2) 2)");
  const rewrites: ReadonlyArray<[Pattern, Pattern]> = [
    [parsePattern("(* ?x 2)"), parsePattern("(<< ?x 1)")],
    [parsePattern("(/ (* ?x ?y) ?z)"), parsePattern("(* ?x (/ ?y ?z))")],
    [parsePattern("(/ ?x ?x)"), parsePattern("1")],
    [parsePattern("(* ?x 1)"), parsePattern("?x")],
  ];

  console.log(printTerm(term));
  const result = EGraph.equality_saturation(term, rewrites);
  console.log(printTerm(result));
}

if (import.meta.main) {
  main();
}

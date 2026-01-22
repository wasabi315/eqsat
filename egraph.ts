import { List, Record, Set, Map } from "immutable";

import { UnionFind, Key } from "./union-find.ts";
import { Substitution, Pattern, Term } from "./language.ts";

export type EClassId = Key;

export type EClass = {
  nodes: Set<ENode>;
  originalNode: ENode;
  parents: Map<ENode, EClassId>;
};

// Define ENode as an Immutable Record for structural equality
const createENode = Record({
  op: "" as string,
  children: List<EClassId>(),
});

export type ENode = ReturnType<typeof createENode>;

export function createSingletonEClass(enode: ENode): EClass {
  return { nodes: Set([enode]), originalNode: enode, parents: Map() };
}

export class EGraph {
  private unionFind: UnionFind = new UnionFind(0);
  // canonical class ID -> corresponding EClass
  private classes: Map<EClassId, EClass> = Map();
  // canonical enode -> canonical class ID
  private hashcons: Map<ENode, EClassId> = Map();
  private worklist: Array<EClassId> = [];

  get classCount(): number {
    return this.classes.size;
  }

  get nodeCount(): number {
    return this.hashcons.size;
  }

  get eclasses(): [EClassId[], { op: string; children: EClassId[] }[]][] {
    const disjointSets = this.unionFind.disjointSets;
    return [...this.classes].map(([eid, { nodes }]) => [
      disjointSets.get(eid)!,
      [...nodes].map(({ op, children }) => ({ op, children: [...children] })),
    ]);
  }

  get enodes(): [ENode, EClassId][] {
    return [...this.hashcons];
  }

  canonicalize(enode: ENode): ENode {
    return createENode({
      op: enode.op,
      children: enode.children.map((eid) => this.unionFind.find(eid)),
    });
  }

  /**
   * Insert an ENode n and returns the ID of the EClass containing n.
   * This operation is idempotent: if there is an existing occurence of the ENode in the EGraph, we don't create a new EClass and just return the existing EClassId.
   */
  add(enode: ENode): EClassId {
    enode = this.canonicalize(enode);

    // Try returning an existing EClassId first.
    {
      const eid = this.hashcons.get(enode);
      if (typeof eid !== "undefined") {
        return eid;
      }
    }

    // Create a new EClass and update classes/hashcons appropriately.
    const eid = this.unionFind.extend();
    this.hashcons = this.hashcons.set(enode, eid);
    const eclass = createSingletonEClass(enode);
    this.classes = this.classes.set(eid, eclass);
    // We also need to update parents of the children.
    for (const child_id of enode.children) {
      const child = this.classes.get(child_id)!;
      child.parents = child.parents.set(enode, eid);
    }
    return eid;
  }

  /**
   * Merge two EClasses.
   * This is no-op if the given EClasses are already the same.
   */
  merge(eid1: EClassId, eid2: EClassId): boolean {
    // We first merge the EClasses on unionFind.
    const unionResult = this.unionFind.union(eid1, eid2)!;
    // No-op if they are already the same.
    if (!unionResult) {
      return false;
    }

    const { root: newRootId, child: oldRootId } = unionResult;

    const newRoot = this.classes.get(newRootId)!;
    const oldRoot = this.classes.get(oldRootId)!;
    // Remove oldRoot from classes, no longer needed.
    this.classes = this.classes.delete(oldRootId);
    const eid = this.hashcons.get(oldRoot.originalNode)!;
    this.hashcons = this.hashcons
      .delete(oldRoot.originalNode)
      .set(this.canonicalize(oldRoot.originalNode), this.unionFind.find(eid));

    // Merge nodes and parents.
    newRoot.nodes = newRoot.nodes.union(oldRoot.nodes);
    newRoot.parents = newRoot.parents.concat(oldRoot.parents);

    // Repair invariants
    this.repair(newRoot);

    return true;
  }

  repair(eclass: EClass) {
    let dedupParents: Map<ENode, EClassId> = Map();
    for (const [parentENode, parentEClassId] of eclass.parents) {
      // Update the hashcons so it always points canonical enodes to canonical eclasses
      const newParentNode = this.canonicalize(parentENode);
      const newParentEid = this.unionFind.find(parentEClassId);
      this.hashcons = this.hashcons
        .delete(parentENode)
        .set(newParentNode, newParentEid);

      // Deduplicate parents and propagate merge
      const newParentEid2 = dedupParents.get(newParentNode);
      if (newParentEid2) {
        this.merge(parentEClassId, newParentEid2);
      }

      dedupParents = dedupParents.set(newParentNode, newParentEid);
    }
    eclass.parents = dedupParents;
  }

  /**
   * Find e-classes that some of their nodes match the given pattern.
   * Also returns substitution for pattern variables.
   */
  *ematch(pattern: Pattern): Generator<[Substitution<EClassId>, EClassId]> {
    function* worker(
      egraph: EGraph,
      pattern: Pattern,
      eid: EClassId,
      subst: Substitution<EClassId>,
    ): Generator<Substitution<EClassId>> {
      eid = egraph.unionFind.find(eid);

      switch (pattern.tag) {
        case "var": {
          const entry = subst.get(pattern.name);
          // Add substitution if it doesn't contradict with existing ones.
          if (typeof entry === "undefined" || entry === eid) {
            yield subst.set(pattern.name, eid);
          }
          break;
        }
        case "node": {
          const eclass = egraph.classes.get(eid)!;
          for (const enode of eclass.nodes) {
            if (pattern.op !== enode.op) {
              continue;
            }

            const children = List(pattern.children).zip(enode.children);
            // substs: iterator of possible substitutions
            let substs = Iterator.from([subst]);
            for (const [childPattern, childEid] of children) {
              // for each sub we get multiple possible substs (consistent with sub) so using flatMap here
              substs = substs.flatMap((sub) =>
                worker(egraph, childPattern, childEid, sub),
              );
            }
            yield* substs;
          }
          break;
        }
      }
    }

    for (const eid of this.classes.keys()) {
      for (const subst of worker(this, pattern, eid, Map())) {
        yield [subst, eid];
      }
    }
  }

  /**
   * Add a term to this e-graph by add-ing each layer in a bottom-up manner.
   */
  addTerm(term: Term): EClassId {
    const childIds = term.children.map((child) => this.addTerm(child));
    const enode = createENode({ op: term.op, children: List(childIds) });
    return this.add(enode);
  }

  /**
   * Add a pattern to this e-graph in a similar way to addTerm.
   * Pattern variables are substituted according to subst.
   */
  addPattern(subst: Substitution<EClassId>, pattern: Pattern): EClassId {
    switch (pattern.tag) {
      case "var":
        return subst.get(pattern.name)!;
      case "node": {
        const childIds = pattern.children.map((child) =>
          this.addPattern(subst, child),
        );
        const enode = createENode({ op: pattern.op, children: List(childIds) });
        return this.add(enode);
      }
    }
  }

  /**
   * Extract the smallest one among the represented terms in the specified e-class.
   */
  extractSmallest(eid: EClassId): [Term, number] {
    // e-graph may contain cycles. To prevent infinite recursion, we need to track visited e-class ids.
    // We also track the upper bound of the size of term for pruning
    const worker = (
      visited: Set<EClassId>,
      upperBound: number,
      eid: EClassId,
    ): [Term, number] => {
      eid = this.unionFind.find(eid);
      if (visited.has(eid) || upperBound < 0) {
        throw new Error();
      }
      const newVisited = visited.add(eid);

      const eclass = this.classes.get(eid)!;

      let minTerm!: Term;
      let minSize = upperBound;

      for (const enode of eclass.nodes) {
        try {
          const accChildren: Term[] = [];
          let accSize = 1;
          for (const child of enode.children) {
            const [term, size] = worker(newVisited, minSize - accSize, child);
            accSize += size;
            accChildren.push(term);
          }
          minSize = accSize;
          minTerm = { op: enode.op, children: accChildren };
        } catch {
          continue;
        }
      }

      return [minTerm, minSize];
    };

    return worker(Set(), Number.MAX_VALUE, eid);
  }
}

export function equality_saturation(
  term: Term,
  rewrites: ReadonlyArray<[Pattern, Pattern]>,
  options?: { maxIteration: number },
): Term {
  const egraph = new EGraph();
  const eid = egraph.addTerm(term);

  dumpEGraph(egraph);

  const maxIteration = options?.maxIteration ?? 16;
  for (let i = 0; i < maxIteration; i++) {
    const currentClassCount = egraph.classCount;
    const currentNodeCount = egraph.nodeCount;
    for (const [lhs, rhs] of rewrites) {
      for (const [subst, eclass] of egraph.ematch(lhs)) {
        console.log("----------------");
        console.log(
          "rewrite",
          printPatternWithSubst(subst, lhs),
          printPatternWithSubst(subst, rhs),
        );
        const eclass2 = egraph.addPattern(subst, rhs);
        egraph.merge(eclass, eclass2);
        dumpEGraph(egraph);
      }
    }
    const newClassCount = egraph.classCount;
    const newNodeCount = egraph.nodeCount;
    const madeProgress =
      currentClassCount !== newClassCount || currentNodeCount !== newNodeCount;
    if (!madeProgress) {
      break;
    }
  }

  return egraph.extractSmallest(eid)[0];
}

function formatENode({
  op,
  children,
}: {
  op: string;
  children: EClassId[];
}): string {
  return children.length === 0
    ? op
    : `(${op} ${children.map((id) => `$${id}`).join(" ")})`;
}

function formatAligned(entries: [string, string][]): string {
  const maxKeyLen = Math.max(...entries.map(([key]) => key.length));
  return entries
    .map(([key, value]) => `  ${key.padEnd(maxKeyLen)} → ${value}`)
    .join("\n");
}

function dumpEGraph(egraph: EGraph) {
  const eclassEntries = egraph.eclasses.map(
    ([eids, nodes]): [string, string] => [
      `{${eids.map((id) => `$${id}`).join(", ")}}`,
      `{ ${nodes.map(formatENode).join(", ")} }`,
    ],
  );

  const enodeEntries = egraph.enodes.map(
    ([{ op, children }, eid]): [string, string] => [
      formatENode({ op, children: [...children] }),
      `$${eid}`,
    ],
  );

  console.log(`e-classes:\n${formatAligned(eclassEntries)}`);
  console.log(`e-nodes:\n${formatAligned(enodeEntries)}`);
}

function printPatternWithSubst(
  subst: Substitution<EClassId>,
  pattern: Pattern,
): string {
  switch (pattern.tag) {
    case "var": {
      const sub = subst.get(pattern.name);
      if (typeof sub !== "undefined") {
        return `$${sub}`;
      }
      return `?${pattern.name}`;
    }
    case "node": {
      if (pattern.children.length === 0) {
        return pattern.op;
      }
      return `(${pattern.op} ${pattern.children.map((child) => printPatternWithSubst(subst, child)).join(" ")})`;
    }
  }
}

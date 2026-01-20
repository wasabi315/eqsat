import { List, Record, Set, Map } from "immutable";

import { UnionFind, Key } from "./union-find.ts";
import { Substitution, Pattern, Term } from "./language.ts";

export type EClassId = Key;

export type EClass = {
  nodes: Set<ENode>;
  originalNode: ENode;
  parents: Array<[ENode, EClassId]>;
};

// Define ENode as an Immutable Record for structural equality
const createENode = Record({
  op: "" as string,
  children: List<EClassId>(),
});

export type ENode = ReturnType<typeof createENode>;

export function createSingletonEClass(enode: ENode): EClass {
  return { nodes: Set([enode]), originalNode: enode, parents: [] };
}

export class EGraph {
  private unionFind: UnionFind = new UnionFind(0);
  // canonical class ID -> corresponding EClass
  private classes: Map<EClassId, EClass> = Map();
  // canonical enode -> canonical class ID
  private hashcons: Map<ENode, EClassId> = Map();

  dump() {
    const disjointSets = this.unionFind.getDisjointSets();
    console.log(
      `{ ${[...this.classes]
        .map(
          ([eid, { nodes }]) =>
            `{${disjointSets
              .get(eid)!
              .map((id) => `$${id}`)
              .join(", ")}} → { ${[...nodes]
              .map(({ op, children }) => {
                if (children.size === 0) {
                  return `${op}`;
                }
                return `${op}(${children.map((id) => `$${id}`).join(", ")})`;
              })
              .join(", ")} }`,
        )
        .join(",\n  ")} }`,
    );
  }

  private canonicalize(enode: ENode): ENode {
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
      child.parents.push([enode, eid]);
    }
    return eid;
  }

  private worklist: Array<EClassId> = [];
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
    newRoot.parents.push(...oldRoot.parents);

    this.worklist.push(newRootId);
    this.rebuild();

    return true;
  }

  rebuild() {
    while (this.worklist.length > 0) {
      const todo = Set(this.worklist.map((id) => this.unionFind.find(id)));
      this.worklist = [];

      for (const id of todo) {
        this.repair(id);
      }
    }
  }

  repair(eid: EClassId) {
    const eclass = this.classes.get(eid)!;

    // Update the hashcons so it always points canonical enodes to canonical eclasses
    for (const [parentENode, parentEClassId] of eclass.parents) {
      const newParentNode = this.canonicalize(parentENode);
      const newParentEClassId = this.unionFind.find(parentEClassId);
      this.hashcons = this.hashcons
        .delete(parentENode)
        .set(newParentNode, newParentEClassId);
    }

    // Deduplicate parents, noting that equal parents get merged and put on the worklist
    let dedupParents: Map<ENode, EClassId> = Map();
    for (const [parentENode, parentEClassId] of eclass.parents) {
      const newParentNode = this.canonicalize(parentENode);
      const newParentEClass = this.unionFind.find(parentEClassId);

      const newParentEClassId2 = dedupParents.get(newParentNode);
      if (newParentEClassId2) {
        this.merge(parentEClassId, newParentEClassId2);
      }

      dedupParents = dedupParents.set(newParentNode, newParentEClass);
    }
    eclass.parents = dedupParents.toArray();
  }

  *ematch(pattern: Pattern): Generator<[Substitution<EClassId>, EClassId]> {
    const self = this;

    function* worker(
      pattern: Pattern,
      eid: EClassId,
      subst: Substitution<EClassId>,
    ): Generator<Substitution<EClassId>> {
      eid = self.unionFind.find(eid);

      switch (pattern.tag) {
        case "var": {
          const entry = subst.get(pattern.name);
          if (typeof entry === "undefined") {
            yield subst.set(pattern.name, eid);
            break;
          }
          if (entry === eid) {
            yield subst;
            break;
          }
          break;
        }
        case "node": {
          const eclass = self.classes.get(eid)!;
          for (const enode of eclass.nodes) {
            if (pattern.op !== enode.op) {
              continue;
            }

            let newSubsts = [subst];
            const children = List(pattern.children).zip(enode.children);
            for (const [childPattern, childEid] of children) {
              newSubsts = newSubsts.flatMap((newSubst) => [
                ...worker(childPattern, childEid, newSubst),
              ]);
            }
            yield* newSubsts;
          }
          break;
        }
      }
    }

    for (const eid of this.classes.keys()) {
      for (const subst of worker(pattern, eid, Map())) {
        yield [subst, eid];
      }
    }
  }

  addTerm(term: Term): EClassId {
    const childIds: Array<EClassId> = [];
    for (const child of term.children) {
      childIds.push(this.addTerm(child));
    }
    const enode = createENode({ op: term.op, children: List(childIds) });
    return this.add(enode);
  }

  addPattern(subst: Substitution<EClassId>, pattern: Pattern): EClassId {
    switch (pattern.tag) {
      case "var":
        return subst.get(pattern.name)!;
      case "node": {
        const childIds: Array<EClassId> = [];
        for (const child of pattern.children) {
          childIds.push(this.addPattern(subst, child));
        }
        const enode = createENode({ op: pattern.op, children: List(childIds) });
        return this.add(enode);
      }
    }
  }

  extract_smallest(eid: EClassId): [Term, number] {
    const worker = (visited: Set<EClassId>, eid: EClassId): [Term, number] => {
      eid = this.unionFind.find(eid);
      if (visited.has(eid)) {
        throw new Error();
      }
      const newVisited = visited.add(eid);

      const eclass = this.classes.get(eid)!;

      let minTerm!: Term;
      let minSize = Number.MAX_VALUE;

      for (const enode of eclass.nodes) {
        try {
          const children = enode.children.map((child) =>
            worker(newVisited, child),
          );
          const childTerm = children.map(([term]) => term);
          const childSize = children.reduce((acc, [_, size]) => acc + size, 0);
          const size = 1 + childSize;
          if (size < minSize) {
            minSize = size;
            minTerm = { op: enode.op, children: childTerm.toArray() };
          }
        } catch {
          continue;
        }
      }

      return [minTerm, minSize];
    };
    return worker(Set(), eid);
  }

  get classCount(): number {
    return this.classes.size;
  }

  get nodeCount(): number {
    return this.hashcons.size;
  }

  static equality_saturation(
    term: Term,
    rewrites: ReadonlyArray<[Pattern, Pattern]>,
    options?: { maxIteration: number },
  ): Term {
    const egraph = new EGraph();
    const eid = egraph.addTerm(term);

    const maxIteration = options?.maxIteration ?? 16;

    for (let i = 0; i < maxIteration; i++) {
      const currentClassCount = egraph.classCount;
      const currentNodeCount = egraph.nodeCount;
      for (const rw of rewrites) {
        // console.log("----------------");
        for (const [subst, eclass] of egraph.ematch(rw[0])) {
          // egraph.dump();
          // console.log();
          // console.log(
          //   printPatternWithSubst(subst, rw[0]),
          //   "⇝",
          //   printPatternWithSubst(subst, rw[1]),
          // );
          // console.log();
          const eclass2 = egraph.addPattern(subst, rw[1]);
          egraph.merge(eclass, eclass2);
          egraph.rebuild();
          // egraph.dump();
        }
      }
      const newClassCount = egraph.classCount;
      const newNodeCount = egraph.nodeCount;
      const madeProgress =
        currentClassCount !== newClassCount ||
        currentNodeCount !== newNodeCount;
      if (!madeProgress) {
        console.log("Saturated after", i + 1, "iteration");
        break;
      }
    }

    return egraph.extract_smallest(eid)[0];
  }
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
      const childrenStr = pattern.children
        .map((child) => printPatternWithSubst(subst, child))
        .join(", ");
      return `${pattern.op}(${childrenStr})`;
    }
  }
}

function printSubst(subst: Substitution<EClassId>) {
  console.log(
    `{ ${[...subst].map((sub) => `${sub[0]} → $${sub[1]}`).join(", ")} }`,
  );
}

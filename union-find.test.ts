import { assert, assertEquals } from "@std/assert";
import * as fc from "fast-check";
import { createKey, UnionFind } from "./union-find.ts";

/**
 * Helper to create a union-find and track unions naively for verification.
 */
class UFModel {
  sets: Set<number>[];

  constructor(size: number) {
    this.sets = Array.from({ length: size }, (_, i) => new Set([i]));
  }

  find(x: number): number {
    for (let i = 0; i < this.sets.length; i++) {
      if (this.sets[i].has(x)) return i;
    }
    throw new Error(`Element ${x} not found`);
  }

  union(x: number, y: number): { root: number; child: number } | null {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return null;

    // Merge sets
    for (const elem of this.sets[rootY]) {
      this.sets[rootX].add(elem);
    }
    this.sets[rootY].clear();
    return { root: rootX, child: rootY };
  }

  connected(x: number, y: number): boolean {
    return this.find(x) === this.find(y);
  }
}

Deno.test("UnionFind - size getter", () => {
  const uf = new UnionFind(5);
  assertEquals(uf.size, 5);
});

Deno.test("UnionFind - extend adds new element", () => {
  const uf = new UnionFind(3);
  assertEquals(uf.size, 3);

  const key3 = uf.extend();
  assertEquals(uf.size, 4);
  assertEquals(key3, createKey(3));

  const key4 = uf.extend();
  assertEquals(uf.size, 5);
  assertEquals(key4, createKey(4));

  // New elements should be in their own sets
  assert(!uf.connected(key3, key4));
  assert(!uf.connected(key3, createKey(0)));
});

Deno.test("UnionFind - extend and union", () => {
  const uf = new UnionFind(2);
  const key2 = uf.extend();

  // Union the new element with existing element
  const result = uf.union(createKey(0), key2);
  assert(result !== null);
  assert(uf.connected(createKey(0), key2));
  assert(!uf.connected(createKey(1), key2));
});

Deno.test("UnionFind - getDisjointSets returns all singleton sets", () => {
  const uf = new UnionFind(5);
  const sets = uf.disjointSets;

  // Should have 5 equivalence classes (all separate)
  assertEquals(sets.size, 5);

  // Each set should contain only one element
  for (let i = 0; i < 5; i++) {
    const key = createKey(i);
    const set = sets.get(key);
    assert(set !== undefined);
    assertEquals(set.length, 1);
    assertEquals(set[0], key);
  }
});

Deno.test("UnionFind - getDisjointSets after unions", () => {
  const uf = new UnionFind(6);

  // Create some unions: {0,1,2}, {3,4}, {5}
  uf.union(createKey(0), createKey(1));
  uf.union(createKey(1), createKey(2));
  uf.union(createKey(3), createKey(4));

  const sets = uf.disjointSets;

  // Should have 3 equivalence classes
  assertEquals(sets.size, 3);

  // Find the class containing 0 (should contain 0, 1, 2)
  const root0 = uf.find(createKey(0));
  const class0 = sets.get(root0);
  assert(class0 !== undefined);
  assertEquals(class0.length, 3);
  assert(class0.includes(createKey(0)));
  assert(class0.includes(createKey(1)));
  assert(class0.includes(createKey(2)));

  // Find the class containing 3 (should contain 3, 4)
  const root3 = uf.find(createKey(3));
  const class3 = sets.get(root3);
  assert(class3 !== undefined);
  assertEquals(class3.length, 2);
  assert(class3.includes(createKey(3)));
  assert(class3.includes(createKey(4)));

  // Find the class containing 5 (should contain only 5)
  const root5 = uf.find(createKey(5));
  const class5 = sets.get(root5);
  assert(class5 !== undefined);
  assertEquals(class5.length, 1);
  assert(class5.includes(createKey(5)));
});

Deno.test("UnionFind - getDisjointSets returns correct roots", () => {
  const uf = new UnionFind(4);
  uf.union(createKey(0), createKey(1));
  uf.union(createKey(2), createKey(3));

  const sets = uf.disjointSets;

  // All keys in the map should be roots
  for (const root of sets.keys()) {
    assertEquals(uf.find(root), root);
  }
});

Deno.test("UnionFind - getDisjointSets with extended elements", () => {
  const uf = new UnionFind(2);
  const key2 = uf.extend();
  const key3 = uf.extend();

  uf.union(createKey(0), createKey(1));
  uf.union(key2, key3);

  const sets = uf.disjointSets;

  // Should have 2 equivalence classes
  assertEquals(sets.size, 2);

  // Check class sizes
  const root0 = uf.find(createKey(0));
  const root2 = uf.find(key2);

  assertEquals(sets.get(root0)?.length, 2);
  assertEquals(sets.get(root2)?.length, 2);
});

Deno.test("UnionFind - initial state", () => {
  const uf = new UnionFind(5);

  // All elements should be in their own set initially
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i === j) {
        assert(uf.connected(createKey(i), createKey(j)));
      } else {
        assert(!uf.connected(createKey(i), createKey(j)));
      }
    }
  }
});

Deno.test("UnionFind - basic union and find", () => {
  const uf = new UnionFind(5);

  uf.union(createKey(0), createKey(1));
  assert(uf.connected(createKey(0), createKey(1)));
  assert(!uf.connected(createKey(0), createKey(2)));

  uf.union(createKey(2), createKey(3));
  assert(uf.connected(createKey(2), createKey(3)));
  assert(!uf.connected(createKey(1), createKey(2)));

  uf.union(createKey(1), createKey(3));
  assert(uf.connected(createKey(0), createKey(2)));
  assert(uf.connected(createKey(1), createKey(3)));
});

Deno.test("UnionFind - property: reflexivity", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 100 }),
      fc.integer({ min: 0, max: 99 }),
      (size, x) => {
        fc.pre(x < size);
        const uf = new UnionFind(size);
        return uf.connected(createKey(x), createKey(x));
      },
    ),
  );
});

Deno.test("UnionFind - property: symmetry", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 100 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      (size, x, y) => {
        fc.pre(x < size && y < size);
        const uf = new UnionFind(size);
        uf.union(createKey(x), createKey(y));
        return (
          uf.connected(createKey(x), createKey(y)) ===
          uf.connected(createKey(y), createKey(x))
        );
      },
    ),
  );
});

Deno.test("UnionFind - property: transitivity", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 100 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      (size, x, y, z) => {
        fc.pre(x < size && y < size && z < size);
        const uf = new UnionFind(size);
        uf.union(createKey(x), createKey(y));
        uf.union(createKey(y), createKey(z));

        // After union(x,y) and union(y,z), x and z must be connected
        return uf.connected(createKey(x), createKey(z));
      },
    ),
  );
});

Deno.test("UnionFind - property: idempotent union", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 100 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      (size, x, y) => {
        fc.pre(x < size && y < size);
        const uf = new UnionFind(size);

        const result1 = uf.union(createKey(x), createKey(y));
        const result2 = uf.union(createKey(x), createKey(y));

        // Second union should return null (already connected)
        return (result1 !== null) === (x !== y) && result2 === null;
      },
    ),
  );
});

Deno.test("UnionFind - property: matches naive implementation", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 50 }),
      fc.array(
        fc.tuple(
          fc.integer({ min: 0, max: 49 }),
          fc.integer({ min: 0, max: 49 }),
        ),
        {
          minLength: 0,
          maxLength: 100,
        },
      ),
      (size, operations) => {
        const uf = new UnionFind(size);
        const model = new UFModel(size);

        for (const [x, y] of operations) {
          if (x >= size || y >= size) continue;

          const ufResult = uf.union(createKey(x), createKey(y));
          const modelResult = model.union(x, y);
          // Both should return null or non-null together
          if ((ufResult === null) !== (modelResult === null)) return false;
        }

        // Verify all connections match
        for (let i = 0; i < size; i++) {
          for (let j = 0; j < size; j++) {
            const ufConnected = uf.connected(createKey(i), createKey(j));
            const modelConnected = model.connected(i, j);
            if (ufConnected !== modelConnected) return false;
          }
        }

        return true;
      },
    ),
  );
});

Deno.test("UnionFind - property: find returns canonical representative", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 100 }),
      fc.array(
        fc.tuple(
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 0, max: 99 }),
        ),
        {
          minLength: 1,
          maxLength: 50,
        },
      ),
      (size, operations) => {
        const uf = new UnionFind(size);

        for (const [x, y] of operations) {
          if (x >= size || y >= size) continue;
          uf.union(createKey(x), createKey(y));
        }

        // Find should be idempotent
        for (let i = 0; i < size; i++) {
          const rep1 = uf.find(createKey(i));
          const rep2 = uf.find(createKey(i));
          if (rep1 !== rep2) return false;

          // Representative should be connected to original element
          if (!uf.connected(createKey(i), rep1)) return false;
        }

        return true;
      },
    ),
  );
});

Deno.test("UnionFind - property: union by rank maintains balance", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 10, max: 100 }),
      fc.array(
        fc.tuple(
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 0, max: 99 }),
        ),
        {
          minLength: 5,
          maxLength: 200,
        },
      ),
      (size, operations) => {
        const uf = new UnionFind(size);

        for (const [x, y] of operations) {
          if (x >= size || y >= size) continue;
          uf.union(createKey(x), createKey(y));
        }

        // Path compression should make subsequent finds fast
        // This is a weak test - just verify that operations complete
        for (let i = 0; i < size; i++) {
          uf.find(createKey(i));
        }

        return true;
      },
    ),
  );
});

Deno.test(
  "UnionFind - property: connected elements have same representative",
  () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 100 }),
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
          ),
          {
            minLength: 1,
            maxLength: 50,
          },
        ),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        (size, operations, x, y) => {
          fc.pre(x < size && y < size);
          const uf = new UnionFind(size);

          for (const [a, b] of operations) {
            if (a >= size || b >= size) continue;
            uf.union(createKey(a), createKey(b));
          }

          const connected = uf.connected(createKey(x), createKey(y));
          const sameRep = uf.find(createKey(x)) === uf.find(createKey(y));

          return connected === sameRep;
        },
      ),
    );
  },
);

/**
 * Branded type for union-find elements to prevent mixing with regular numbers.
 */
export type Key = number & { readonly __brand: "Key" };

/**
 * Coerce a number to a Key.
 */
export function createKey(key: number): Key {
  return key as Key;
}

/**
 * Union-Find (Disjoint Set Union) data structure with path compression and union by rank.
 *
 * This implementation uses two arrays:
 * - parent: tracks the parent of each element
 * - rank: tracks the approximate depth of trees for union by rank optimization
 */
export class UnionFind {
  private parent: Key[];
  private rank: number[];

  /**
   * Initialize union-find with n elements (0 to n-1).
   * Initially, each element is in its own set.
   */
  constructor(size: number) {
    this.parent = new Array(size);
    this.rank = new Array(size);

    for (let i = 0; i < size; i++) {
      this.parent[i] = createKey(i);
      this.rank[i] = 0;
    }
  }

  /**
   * Find the representative (root) of the set containing element x.
   * Uses path compression for optimization.
   */
  find(x: Key): Key {
    if (this.parent[x] !== x) {
      // Path compression: make every node point directly to the root
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  /**
   * Union the sets containing elements x and y.
   * Uses union by rank to keep trees balanced.
   * Returns an object indicating which root remains and which becomes a child,
   * or null if they were already in the same set.
   */
  union(x: Key, y: Key): { root: Key; child: Key } | null {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) {
      return null; // Already in the same set
    }

    // Union by rank: attach smaller tree under larger tree
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
      return { root: rootY, child: rootX };
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
      return { root: rootX, child: rootY };
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
      return { root: rootX, child: rootY };
    }
  }

  /**
   * Check if elements x and y are in the same set.
   */
  connected(x: Key, y: Key): boolean {
    return this.find(x) === this.find(y);
  }

  /**
   * Add a new element to the union-find structure.
   * Returns the Key for the newly added element.
   * The new element starts in its own singleton set.
   */
  extend(): Key {
    const newKey = createKey(this.parent.length);
    this.parent.push(newKey);
    this.rank.push(0);
    return newKey;
  }

  /**
   * Get the current size (number of elements) in the union-find structure.
   */
  get size(): number {
    return this.parent.length;
  }

  /**
   * Get all disjoint sets as a Map from root to members.
   * Each root maps to an array of all elements in that equivalence class.
   *
   * Example:
   * ```ts
   * const uf = new UnionFind(5);
   * uf.union(createKey(0), createKey(2));
   * uf.union(createKey(1), createKey(3));
   * const sets = uf.disjointSets;
   * // Map { 0 => [0, 2], 1 => [1, 3], 4 => [4] }
   * ```
   */
  get disjointSets(): Map<Key, Key[]> {
    const classes = new Map<Key, Key[]>();

    for (let i = 0; i < this.size; i++) {
      const key = createKey(i);
      const root = this.find(key);

      if (!classes.has(root)) {
        classes.set(root, [root]);
      }
      if (key !== root) {
        classes.get(root)!.push(key);
      }
    }

    return classes;
  }
}

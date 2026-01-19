/**
 * Composites polyfill initialization.
 *
 * This module installs the TC39 composites proposal polyfill globally,
 * modifying the native Map, Set, and Array prototypes to support
 * structural equality for Composite values.
 *
 * Import this module once at the entry point of your application:
 * ```ts
 * import "./composites.ts";
 * ```
 *
 * After installation, you can use Composite values with native Map and Set:
 * ```ts
 * import { Composite } from "./composites.ts";
 *
 * const map = new Map();
 * const key = Composite({ a: 1, b: 2 });
 * map.set(key, "value");
 * map.get(Composite({ b: 2, a: 1 })); // "value" - structural equality!
 * ```
 */

import { Composite, install } from "./vendor/composites/polyfill/index.ts";

// Install the polyfill globally (modifies Map, Set, Array prototypes)
install(globalThis);

// Re-export Composite for use throughout the project
export { Composite };
export type { Composite as CompositeType } from "./vendor/composites/polyfill/index.ts";

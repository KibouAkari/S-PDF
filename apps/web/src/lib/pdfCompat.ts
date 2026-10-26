/** Compatibility shim for Map/WeakMap upsert methods required by pdf.js 6.
 * Remove once the project no longer supports browsers older than Chrome 145.
 * Both the main thread and the dedicated PDF worker must load this module.
 */
type UpsertMap<K, V> = Map<K, V> & {
  getOrInsert?: (key: K, value: V) => V;
  getOrInsertComputed?: (key: K, factory: (key: K) => V) => V;
};
type UpsertWeakMap<K extends WeakKey, V> = WeakMap<K, V> & {
  getOrInsert?: (key: K, value: V) => V;
  getOrInsertComputed?: (key: K, factory: (key: K) => V) => V;
};

function polyfillMapPrototype(proto: object) {
  if (!Object.prototype.hasOwnProperty.call(proto, "getOrInsert")) {
    Object.defineProperty(proto, "getOrInsert", {
      configurable: true, writable: true,
      value: function<K, V>(this: UpsertMap<K, V> | UpsertWeakMap<K & WeakKey, V>, key: K, value: V): V {
        if (this.has(key as K & WeakKey)) return this.get(key as K & WeakKey) as V;
        this.set(key as K & WeakKey, value);
        return value;
      },
    });
  }
  if (!Object.prototype.hasOwnProperty.call(proto, "getOrInsertComputed")) {
    Object.defineProperty(proto, "getOrInsertComputed", {
      configurable: true, writable: true,
      value: function<K, V>(this: UpsertMap<K, V> | UpsertWeakMap<K & WeakKey, V>,
          key: K, factory: (key: K) => V): V {
        if (this.has(key as K & WeakKey)) return this.get(key as K & WeakKey) as V;
        const value = factory(key);
        this.set(key as K & WeakKey, value);
        return value;
      },
    });
  }
}

polyfillMapPrototype(Map.prototype);
polyfillMapPrototype(WeakMap.prototype);

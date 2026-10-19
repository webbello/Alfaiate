/** Wraps a Workers binding and replaces some methods; every other method stays bound to the real object. */
export function override<T extends object>(
  target: T,
  replacements: Record<string, (...args: never[]) => unknown>,
): T {
  return new Proxy(target, {
    get(real, prop) {
      if (typeof prop === 'string' && Object.hasOwn(replacements, prop))
        return replacements[prop];
      const value = (real as Record<string | symbol, unknown>)[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
}

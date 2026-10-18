export class ConfigError extends Error {}

const REQUIRED = ['DB', 'MEDIA_PUBLIC', 'MEDIA_PRIVATE'] as const;

type Bindings = Pick<Cloudflare.Env, (typeof REQUIRED)[number]>;

/** Returns the bindings the app needs, or throws naming the missing ones (fails closed). */
export function requireBindings(env: Partial<Bindings>): Bindings {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0)
    throw new ConfigError(`Missing bindings: ${missing.join(', ')}`);
  return env as Bindings;
}

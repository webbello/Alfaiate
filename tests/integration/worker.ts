import { exports } from 'cloudflare:workers';

// The generated Exports type comes from the root wrangler.jsonc, which has no `main`; the built worker does.
export const worker = (
  exports as unknown as {
    default: { fetch(request: Request): Promise<Response> };
  }
).default;

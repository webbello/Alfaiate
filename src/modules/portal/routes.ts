/**
 * Every file under src/pages/portal, with who may open it (SEC-09, FR-TPO-03). `public` pages (sign-in, accept an invite) must not show
 * tailor data; every `tailor` page starts with `requireTailor`. tests/workers/portal-route-inventory.test.ts fails if a file is missing or unguarded.
 */
export const PORTAL_ROUTES: readonly {
  file: string;
  path: string;
  access: 'public' | 'tailor';
  methods: readonly ('GET' | 'POST')[];
}[] = [
  { file: 'login.astro', path: '/portal/login', access: 'public', methods: ['GET', 'POST'] },
  { file: 'accept.astro', path: '/portal/accept', access: 'public', methods: ['GET', 'POST'] },
  { file: 'logout.ts', path: '/portal/logout', access: 'tailor', methods: ['POST'] },
  { file: 'index.astro', path: '/portal', access: 'tailor', methods: ['GET'] },
];

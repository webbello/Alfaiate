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
  {
    file: 'login.astro',
    path: '/portal/login',
    access: 'public',
    methods: ['GET', 'POST'],
  },
  {
    file: 'accept.astro',
    path: '/portal/accept',
    access: 'public',
    methods: ['GET', 'POST'],
  },
  {
    file: 'submit.ts',
    path: '/portal/submit',
    access: 'tailor',
    methods: ['POST'],
  },
  {
    file: 'logout.ts',
    path: '/portal/logout',
    access: 'tailor',
    methods: ['POST'],
  },
  { file: 'index.astro', path: '/portal', access: 'tailor', methods: ['GET'] },
  {
    file: 'profile.astro',
    path: '/portal/profile',
    access: 'tailor',
    methods: ['GET', 'POST'],
  },
  {
    file: 'work.astro',
    path: '/portal/work',
    access: 'tailor',
    methods: ['GET', 'POST'],
  },
  {
    file: 'photos.astro',
    path: '/portal/photos',
    access: 'tailor',
    methods: ['GET'],
  },
  {
    file: 'photos/upload.ts',
    path: '/portal/photos/upload',
    access: 'tailor',
    methods: ['POST'],
  },
  {
    file: 'photos/save.ts',
    path: '/portal/photos/save',
    access: 'tailor',
    methods: ['POST'],
  },
  {
    file: 'products.astro',
    path: '/portal/products',
    access: 'tailor',
    methods: ['GET', 'POST'],
  },
  {
    file: 'products/[id].astro',
    path: '/portal/products/[id]',
    access: 'tailor',
    methods: ['GET', 'POST'],
  },
  {
    file: 'products/[id]/photo.ts',
    path: '/portal/products/[id]/photo',
    access: 'tailor',
    methods: ['POST'],
  },
  {
    file: 'products/[id]/photo-remove.ts',
    path: '/portal/products/[id]/photo-remove',
    access: 'tailor',
    methods: ['POST'],
  },
  {
    file: 'media/[...key].ts',
    path: '/portal/media/[...key]',
    access: 'tailor',
    methods: ['GET'],
  },
];

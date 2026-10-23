/* global Buffer, crypto, TextEncoder */
// `node scripts/demo-shop.mjs add|remove`: fill or empty the LOCAL shop with 15 realistic demo products and the credited stock photos
// in public/images/site (CREDITS.md). Local only: it uses wrangler's local bindings (the same local database and storage as `npm run dev`),
// never a remote one. Demo products are recognised by two markers together: a `demo-` slug and the fixed published_at below.
// It also creates one demo TAILOR you can sign in as (see TAILOR_LOGIN below) with three published products and one draft waiting for approval, and three demo orders.
// Run by `npm run db:demo` / `npm run db:demo:remove`.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getPlatformProxy } from 'wrangler';

const MARK = '2026-01-01T00:00:00.000Z';
const SCENES = join('public/images/site');
function join(a, b = '') { return b ? `${a}/${b}` : a; }

// [slug, name, type, price (cents), note, availability, featured, photos (credited scene names), description, details, features]
const PRODUCTS = [
  ['linen-work-shirt', 'Linen Work Shirt', 'ready-made', 3200, null, 'available', 1, ['shirts-800', 'custom-800', 'rack-800'],
    'A light linen shirt cut for long, warm days. Easy to wash and quick to dry, it is made to be worn open or buttoned to the collar.',
    ['Sizes S to XXL', 'Short or long sleeve', 'Sky blue, white or sand'], ['Breathable linen blend', 'Mother-of-pearl style buttons', 'Relaxed straight fit']],
  ['classic-black-blazer', 'Classic Black Blazer', 'exclusive-collection', 12000, null, 'available', 1, ['suits-800', 'business-900', 'rack-800'],
    'A fully lined single-breasted blazer in a dark, hard-wearing cloth. Finished by hand at the lapel and cuffs.',
    ['Sizes 36 to 48', 'Two-button front', 'Fully lined'], ['Hand-finished lapel', 'Working cuff buttons', 'Two inside pockets']],
  ['cream-wrap-dress', 'Cream Wrap Dress', 'exclusive-collection', 8500, null, 'available', 1, ['dresses-800', 'home-visit-900'],
    'A soft wrap dress that ties at the waist and moves with you. A favourite for weddings and family occasions.',
    ['Sizes XS to XL', 'Knee length', 'Adjustable tie waist'], ['Flowing fabric', 'Side pockets', 'Fits many body shapes']],
  ['school-uniform-set', 'School Uniform Set', 'ready-made', 2800, 'per set', 'available', 0, ['uniforms-800', 'rack-800'],
    'A shirt and shorts or skirt set in the standard school colours. Sewn with strong seams for a full school year of wear.',
    ['Ages 6 to 16', 'Shirt and shorts or skirt', 'Sewn with strong double seams'], ['Colour-fast fabric', 'Room to grow in the hem', 'Easy-care']],
  ['wedding-day-accessory-set', 'Wedding Day Accessory Set', 'accessories', 4500, null, 'available', 0, ['wedding-800'],
    'A matching set for the day: a corsage, a pocket square and a hair comb, made to go with soft, natural colours.',
    ['Corsage, pocket square and hair comb', 'Ivory and sage', 'Gift boxed'], ['Made to match', 'Lightweight', 'Pin and clip fixings']],
  ['woven-ceremonial-cloth', 'Woven Ceremonial Cloth', 'fabrics', 6000, 'per 2 metres', 'available', 1, ['traditional-800', 'craft-1200'],
    'A richly patterned woven cloth for ceremonial wear, table runners or wall hangings. Each length is cut to order.',
    ['Cut to order in 2 metre lengths', 'Pattern repeats along the length', 'Dry clean or gentle hand wash'], ['Tightly woven', 'Strong colours', 'Hem-ready edges']],
  ['indigo-cotton-fabric', 'Indigo Cotton Fabric', 'fabrics', 950, 'per metre', 'available', 0, ['final-cta-1400', 'craft-1200'],
    'A deep blue cotton cloth that is easy to cut and sew. Good for shirts, trousers, bags and cushion covers.',
    ['Sold by the metre', '150 cm wide', 'Pre-washed'], ['Medium weight', 'Soft hand-feel', 'Takes a crisp press']],
  ['tailors-shears-9-inch', "Tailor's Shears, 9 inch", 'accessories', 2400, null, 'available', 0, ['craft-1200', 'custom-800'],
    'Long-bladed shears that cut cloth cleanly in one stroke. Keep them for fabric only and they will last for years.',
    ['9 inch (23 cm) blades', 'Right-handed', 'Comes with a cloth sleeve'], ['Hardened steel blades', 'Comfortable bent handle', 'Easy to sharpen']],
  ['sewing-repair-kit', 'Sewing Repair Kit', 'accessories', 1200, null, 'available', 0, ['alterations-800'],
    'Everything for a quick repair at home: needles, strong thread in six colours, spare buttons, pins and small scissors.',
    ['Needles and pins', 'Six thread colours', 'Spare buttons and a thimble'], ['Fits in a pocket', 'Hard-wearing case', 'Good for travel']],
  ['everyday-chinos', 'Everyday Chinos', 'ready-made', 3800, null, 'available', 0, ['rack-800', 'business-900'],
    'Straight-leg chinos in a soft cotton twill. Smart enough for the office and comfortable enough for a long day on foot.',
    ['Waists 28 to 40', 'Straight leg', 'Khaki, navy and olive'], ['Cotton twill', 'Deep front pockets', 'Hem can be altered']],
  ['formal-waistcoat', 'Formal Waistcoat', 'exclusive-collection', 5500, null, 'available', 0, ['suits-800', 'business-900'],
    'A fitted waistcoat with a satin back and an adjustable strap. Wear it with the blazer for a three-piece look.',
    ['Sizes 36 to 46', 'Five-button front', 'Adjustable back strap'], ['Satin back', 'Two welt pockets', 'Matches the black blazer']],
  ['casual-blue-shirt', 'Casual Blue Shirt', 'ready-made', 2900, null, 'available', 0, ['hero-1600', 'shirts-800'],
    'A relaxed blue shirt in soft cotton. Roll the sleeves up and wear it out, or tuck it in for the day.',
    ['Sizes S to XXL', 'Regular fit', 'Machine washable'], ['Soft cotton', 'Chest pocket', 'Curved hem']],
  ['evening-dress-fabric-set', 'Evening Dress Fabric Set', 'fabrics', 4000, 'per set', 'unavailable', 0, ['dresses-800', 'traditional-800'],
    'A matched set of main cloth, lining and trim, enough for one evening dress. Ask your tailor to make it up to your measurements.',
    ['Enough for one dress up to size 16', 'Main cloth, lining and trim', 'Pattern advice available'], ['Drapes well', 'Lining included', 'Colours chosen to match']],
  ['measuring-tape-chalk-set', 'Measuring Tape and Chalk Set', 'accessories', 850, null, 'available', 0, ['custom-800', 'craft-1200'],
    'A soft tape that reads in centimetres and inches, with tailor chalk in three colours. A good start for anyone learning to sew.',
    ['150 cm soft tape', 'Three chalk colours', 'Pocket sized'], ['Does not stretch', 'Easy-to-read numbers', 'Brushes off cloth']],
  ['garment-bag', 'Garment Bag', 'accessories', 1400, null, 'available', 0, ['rack-800', 'home-visit-900'],
    'A zipped bag that keeps a suit or dress clean and uncreased on the way to an event.',
    ['Fits one suit or dress', 'Full-length zip', 'Hanger hook through the top'], ['Dust and water resistant', 'Reinforced handles', 'Folds flat']],
];

// A made-up tailor sign-in for trying the portal locally. The password is public in this file on purpose: it exists only in a local demo database and is removed with the demo data.
const TAILOR_LOGIN = { email: 'tailor.demo@example.test', password: 'Tailor-Demo-2026', slug: 'demo-sewing-studio' };
const TAILOR_PRODUCTS = [
  // [slug, name, type, cents, photos, description, details, features, published]
  ['tailor-hemmed-trousers', 'Hand-Hemmed Trousers', 'ready-made', 3600, ['rack-800', 'business-900'], 'Smart trousers, hemmed by hand to your length before they leave the workshop.', ['Waists 28 to 40', 'Hemmed to order', 'Navy and charcoal'], ['Hand-finished hem', 'Hidden waist adjuster', 'Two side pockets'], 1],
  ['tailor-patchwork-cushion', 'Patchwork Cushion Cover', 'accessories', 1600, ['traditional-800', 'craft-1200'], 'A cushion cover made from offcuts of woven cloth, each one a little different.', ['45 cm square', 'Zip closure', 'Cover only'], ['Made from offcuts', 'Washable', 'One of a kind'], 1],
  ['tailor-school-bag', 'Canvas School Bag', 'accessories', 2200, ['uniforms-800', 'rack-800'], 'A strong canvas bag with a padded back and two deep pockets for school books.', ['Fits A4 books', 'Padded straps', 'Navy canvas'], ['Double-stitched seams', 'Padded back', 'Water-resistant canvas'], 1],
  ['tailor-embroidered-tote', 'Hand-Embroidered Tote', 'accessories', 1800, ['custom-800'], 'A cotton tote with a hand-embroidered flower. Waiting for Alfaiate TL to check it before it goes on the shop.', ['Cotton canvas', 'Embroidered by hand', 'Long handles'], ['Reusable', 'Washable', 'Roomy'], 0],
];
const b64url = (bytes) => Buffer.from(bytes).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function hashPassword(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}

const key = (slug, i) => createHash('sha256').update(`${slug}:${i}`).digest('hex').slice(0, 32);
const variants = async (name) => {
  const file = await readFile(join(SCENES, `${name}.webp`));
  const make = (width) => sharp(file).resize({ width }).jpeg({ quality: 82 }).toBuffer();
  return { thumb: await make(320), medium: await make(800), large: await make(1600) };
};

const mode = process.argv[2];
if (!['add', 'remove'].includes(mode)) {
  console.error('Usage: node scripts/demo-shop.mjs add|remove');
  process.exit(1);
}
const { env, dispose } = await getPlatformProxy();
try {
  // Remove first, so running `add` twice never duplicates: both markers must match.
  const oldTailor = await env.DB
    .prepare('SELECT t.id FROM tailor t JOIN tailor_account a ON a.tailor_id = t.id WHERE t.slug = ? AND a.email = ?')
    .bind(TAILOR_LOGIN.slug, TAILOR_LOGIN.email)
    .first();
  const theirs = oldTailor ? (await env.DB.prepare('SELECT id FROM product WHERE seller_tailor_id = ?').bind(oldTailor.id).all()).results : [];
  const old = await env.DB.prepare("SELECT id FROM product WHERE slug LIKE 'demo-%' AND published_at = ?").bind(MARK).all();
  await env.DB.prepare("DELETE FROM shop_order WHERE reference_code LIKE 'OR-DEMO%'").run();
  for (const { id } of [...old.results, ...theirs]) {
    for (const bucket of [env.MEDIA_PRIVATE, env.MEDIA_PUBLIC]) {
      const listed = await bucket.list({ prefix: `product/${id}/` });
      if (listed.objects.length) await bucket.delete(listed.objects.map((o) => o.key));
    }
    await env.DB.prepare('DELETE FROM product WHERE id = ?').bind(id).run();
  }
  if (oldTailor) await env.DB.prepare('DELETE FROM tailor WHERE id = ?').bind(oldTailor.id).run();
  if (mode === 'add') {
    const cats = Object.fromEntries((await env.DB.prepare('SELECT slug, id FROM product_category').all()).results.map((c) => [c.slug, c.id]));
    for (const [slug, name, type, cents, note, availability, featured, photos, description, details, features] of PRODUCTS) {
      const row = await env.DB
        .prepare(
          `INSERT INTO product (slug, name, description, price_cents, price_note, category_id, availability, details, features, is_featured, is_published, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .bind(`demo-${slug}`, name, description, cents, note, cats[type] ?? null, availability, details.join('\n'), features.join('\n'), featured, MARK)
        .run();
      const id = row.meta.last_row_id;
      for (const [i, scene] of photos.entries()) {
        const fileKey = key(slug, i);
        const v = await variants(scene);
        for (const [size, bytes] of Object.entries(v))
          for (const bucket of [env.MEDIA_PRIVATE, env.MEDIA_PUBLIC])
            await bucket.put(`product/${id}/${fileKey}/${size}.jpg`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
        await env.DB.prepare('INSERT INTO product_image (product_id, file_key, alt_text, sort_order) VALUES (?, ?, ?, ?)')
          .bind(id, fileKey, `${name}, photo ${i + 1}`, i + 1)
          .run();
      }
    }
    // The demo tailor: approved and published, so their approved products are on the shop; one product is still a draft for staff to approve.
    const t = await env.DB
      .prepare(
        `INSERT INTO tailor (slug, display_name, description, status, is_published, published_at, permission_recorded, permission_date, contact_publish_consent, whatsapp_e164, phone_e164, home_visits, languages)
         VALUES (?, 'Demo Sewing Studio', 'A small made-up workshop that makes bags, cushion covers and trousers to order. Used to try the tailor sign-in and shop.', 'approved', 1, ?, 1, '2026-01-01', 1, '+67077000111', '+67077000112', 'yes', 'Tetum, English')`,
      )
      .bind(TAILOR_LOGIN.slug, MARK)
      .run();
    const tailorId = t.meta.last_row_id;
    await env.DB
      .prepare("INSERT INTO tailor_account (tailor_id, email, password_hash, is_active, consent_version, consent_at) VALUES (?, ?, ?, 1, 'tailor-consent-2026-10-v1', ?)")
      .bind(tailorId, TAILOR_LOGIN.email, await hashPassword(TAILOR_LOGIN.password), MARK)
      .run();
    for (const [slug, name, type, cents, photos, description, details, features, published] of TAILOR_PRODUCTS) {
      const row = await env.DB
        .prepare(
          `INSERT INTO product (slug, name, description, price_cents, category_id, seller_tailor_id, details, features, is_published, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(`demo-${slug}`, name, description, cents, cats[type] ?? null, tailorId, details.join('\n'), features.join('\n'), published, published ? MARK : null)
        .run();
      const id = row.meta.last_row_id;
      for (const [i, scene] of photos.entries()) {
        const fileKey = key(slug, i);
        for (const [size, bytes] of Object.entries(await variants(scene))) {
          await env.MEDIA_PRIVATE.put(`product/${id}/${fileKey}/${size}.jpg`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
          if (published) await env.MEDIA_PUBLIC.put(`product/${id}/${fileKey}/${size}.jpg`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
        }
        await env.DB
          .prepare('INSERT INTO product_image (product_id, file_key, alt_text, sort_order, permission_granted, permission_date) VALUES (?, ?, ?, ?, 1, ?)')
          .bind(id, fileKey, `${name}, photo ${i + 1}`, i + 1, '2026-01-01')
          .run();
      }
    }
    // Three demo orders so the staff Orders page has something to show (no customer details are ever stored).
    const orders = [
      ['OR-DEMO2345', 'demo-linen-work-shirt', 'Linen Work Shirt', 2, 3200, 'admin', 'Alfaiate TL'],
      ['OR-DEMO3456', 'demo-tailor-school-bag', 'Canvas School Bag', 1, 2200, 'admin', 'Alfaiate TL'],
      ['OR-DEMO4567', 'demo-cream-wrap-dress', 'Cream Wrap Dress', 1, 8500, 'admin', 'Alfaiate TL'],
    ];
    for (const [ref, slug, name, quantity, priceCents, kind, label] of orders)
      await env.DB
        .prepare('INSERT INTO shop_order (reference_code, total_cents, items_json, routes_json) VALUES (?, ?, ?, ?)')
        .bind(ref, quantity * priceCents, JSON.stringify([{ slug, name, quantity, priceCents }]), JSON.stringify([{ kind, label, items: 1, subtotalCents: quantity * priceCents }]))
        .run();
    console.log(`Loaded ${PRODUCTS.length} demo products with photos (local only). Remove them with: npm run db:demo:remove`);
    console.log(`\nTAILOR SIGN-IN (local demo): ${TAILOR_LOGIN.email} / ${TAILOR_LOGIN.password}  at /portal/login`);
  } else console.log('Demo products removed (local only).');
} finally {
  await dispose();
}

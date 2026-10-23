// `node scripts/demo-shop.mjs add|remove`: fill or empty the LOCAL shop with 15 realistic demo products and the credited stock photos
// in public/images/site (CREDITS.md). Local only: it uses wrangler's local bindings (the same local database and storage as `npm run dev`),
// never a remote one. Demo products are recognised by two markers together: a `demo-` slug and the fixed published_at below.
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
  const old = await env.DB.prepare("SELECT id FROM product WHERE slug LIKE 'demo-%' AND published_at = ?").bind(MARK).all();
  for (const { id } of old.results) {
    for (const bucket of [env.MEDIA_PRIVATE, env.MEDIA_PUBLIC]) {
      const listed = await bucket.list({ prefix: `product/${id}/` });
      if (listed.objects.length) await bucket.delete(listed.objects.map((o) => o.key));
    }
    await env.DB.prepare('DELETE FROM product WHERE id = ?').bind(id).run();
  }
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
    console.log(`Loaded ${PRODUCTS.length} demo products with photos (local only). Remove them with: npm run db:demo:remove`);
  } else console.log('Demo products removed (local only).');
} finally {
  await dispose();
}

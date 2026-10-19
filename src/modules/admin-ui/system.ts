/** True while there is no tailor and no enquiry at all: a brand new system, which gets the "getting started" card. */
export async function isSystemEmpty(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT (SELECT count(*) FROM tailor) AS tailors, (SELECT count(*) FROM enquiry) AS enquiries',
    )
    .first<{ tailors: number; enquiries: number }>();
  return !row || (row.tailors === 0 && row.enquiries === 0);
}

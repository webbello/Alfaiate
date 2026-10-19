export type ImageRow = {
  id: number;
  file_key: string;
  alt_text: string;
  caption: string | null;
  sort_order: number;
  permission_granted: number;
  permission_date: string | null;
  is_visible: number;
};

export async function listImages(
  db: D1Database,
  tailorId: number,
): Promise<ImageRow[]> {
  const { results } = await db
    .prepare(
      'SELECT id, file_key, alt_text, caption, sort_order, permission_granted, permission_date, is_visible FROM portfolio_image WHERE tailor_id = ? ORDER BY sort_order, id',
    )
    .bind(tailorId)
    .all<ImageRow>();
  return results;
}

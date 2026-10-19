import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** WCAG 2.0 to 2.2, levels A and AA (NFR-A11Y-01). */
export const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
];

/** Short descriptions of every axe violation on the page, empty when there are none. */
export async function violationsOf(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
}

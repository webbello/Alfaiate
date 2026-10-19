import type { Lang } from '../lang';
import { en, type Dictionary } from './en';
import { tet } from './tet';

export type { Dictionary };

export const dictionary = (lang: Lang): Dictionary =>
  lang === 'tet' ? tet : en;

/** Fills `{name}` placeholders in a dictionary text; unknown placeholders stay visible so a mistake is noticed. */
export const fill = (
  text: string,
  values: Record<string, string | number>,
): string =>
  text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : whole,
  );

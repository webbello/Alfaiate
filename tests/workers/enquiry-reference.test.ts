import { describe, expect, it } from 'vitest';
import {
  REFERENCE_ALPHABET,
  newReference,
} from '../../src/modules/enquiry/reference';

// FR-ENQ-04, BR-07: the code is shown to the customer and used in the notification, so it must be random and carry nothing personal.
describe('newReference', () => {
  it('is AT- plus 8 characters from an alphabet without look-alikes', () => {
    for (let i = 0; i < 500; i++)
      expect(newReference()).toMatch(/^AT-[A-HJ-NP-Z2-9]{8}$/);
    expect(REFERENCE_ALPHABET).not.toMatch(/[01OI]/);
  });

  it('does not repeat across 10,000 codes and is not sequential', () => {
    const codes = Array.from({ length: 10_000 }, newReference);
    expect(new Set(codes).size).toBe(codes.length);
    const sorted = [...codes].sort();
    expect(codes).not.toEqual(sorted);
  });
});

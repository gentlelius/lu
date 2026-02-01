/**
 * Basic setup test to verify Jest and fast-check are working correctly
 */

import * as fc from 'fast-check';

describe('Test Framework Setup', () => {
  describe('Jest', () => {
    it('should run basic tests', () => {
      expect(1 + 1).toBe(2);
    });

    it('should handle async tests', async () => {
      const result = await Promise.resolve(42);
      expect(result).toBe(42);
    });
  });

  describe('fast-check', () => {
    it('should run property-based tests', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          // Property: adding zero to any integer returns the same integer
          expect(n + 0).toBe(n);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate strings', () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          // Property: string length is always non-negative
          expect(s.length).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });
  });
});

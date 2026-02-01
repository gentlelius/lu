import { PairingCodeGenerator } from '../pairing-code-generator';

describe('PairingCodeGenerator', () => {
  let generator: PairingCodeGenerator;

  beforeEach(() => {
    generator = new PairingCodeGenerator();
  });

  describe('generate', () => {
    it('should generate a pairing code', () => {
      const code = generator.generate();
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
    });

    it('should generate a code with correct format XXX-XXX-XXX', () => {
      const code = generator.generate();
      expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    });

    it('should generate a code with exactly 11 characters (including separators)', () => {
      const code = generator.generate();
      expect(code.length).toBe(11);
    });

    it('should generate a code with exactly 9 characters (excluding separators)', () => {
      const code = generator.generate();
      const withoutSeparators = code.replace(/-/g, '');
      expect(withoutSeparators.length).toBe(9);
    });

    it('should generate codes with only uppercase letters and digits', () => {
      const code = generator.generate();
      const withoutSeparators = code.replace(/-/g, '');
      expect(withoutSeparators).toMatch(/^[A-Z0-9]+$/);
    });

    it('should generate different codes on multiple calls', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generator.generate());
      }
      // With 36^9 possibilities, 100 codes should all be unique
      expect(codes.size).toBe(100);
    });

    it('should have separators at positions 3 and 7', () => {
      const code = generator.generate();
      expect(code[3]).toBe('-');
      expect(code[7]).toBe('-');
    });
  });

  describe('validate', () => {
    it('should validate a correctly formatted code', () => {
      const validCode = 'ABC-123-XYZ';
      expect(generator.validate(validCode)).toBe(true);
    });

    it('should validate codes with all uppercase letters', () => {
      const validCode = 'ABC-DEF-GHI';
      expect(generator.validate(validCode)).toBe(true);
    });

    it('should validate codes with all digits', () => {
      const validCode = '123-456-789';
      expect(generator.validate(validCode)).toBe(true);
    });

    it('should validate codes with mixed letters and digits', () => {
      const validCode = 'A1B-2C3-D4E';
      expect(generator.validate(validCode)).toBe(true);
    });

    it('should reject codes with lowercase letters', () => {
      const invalidCode = 'abc-123-xyz';
      expect(generator.validate(invalidCode)).toBe(false);
    });

    it('should reject codes without separators', () => {
      const invalidCode = 'ABC123XYZ';
      expect(generator.validate(invalidCode)).toBe(false);
    });

    it('should reject codes with wrong separator positions', () => {
      const invalidCode = 'AB-C123-XYZ';
      expect(generator.validate(invalidCode)).toBe(false);
    });

    it('should reject codes that are too short', () => {
      const invalidCode = 'AB-123-XY';
      expect(generator.validate(invalidCode)).toBe(false);
    });

    it('should reject codes that are too long', () => {
      const invalidCode = 'ABCD-123-XYZ';
      expect(generator.validate(invalidCode)).toBe(false);
    });

    it('should reject codes with special characters', () => {
      const invalidCode = 'AB@-123-XYZ';
      expect(generator.validate(invalidCode)).toBe(false);
    });

    it('should reject codes with spaces', () => {
      const invalidCode = 'ABC -123-XYZ';
      expect(generator.validate(invalidCode)).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(generator.validate('')).toBe(false);
    });

    it('should reject null values', () => {
      expect(generator.validate(null as any)).toBe(false);
    });

    it('should reject undefined values', () => {
      expect(generator.validate(undefined as any)).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(generator.validate(123 as any)).toBe(false);
      expect(generator.validate({} as any)).toBe(false);
      expect(generator.validate([] as any)).toBe(false);
    });

    it('should validate generated codes', () => {
      for (let i = 0; i < 100; i++) {
        const code = generator.generate();
        expect(generator.validate(code)).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive generation', () => {
      const codes: string[] = [];
      for (let i = 0; i < 1000; i++) {
        codes.push(generator.generate());
      }
      
      // All codes should be valid
      codes.forEach(code => {
        expect(generator.validate(code)).toBe(true);
      });
      
      // All codes should be unique (statistically)
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(1000);
    });

    it('should generate codes with good character distribution', () => {
      const codes: string[] = [];
      for (let i = 0; i < 1000; i++) {
        codes.push(generator.generate());
      }
      
      // Count character occurrences
      const charCounts = new Map<string, number>();
      codes.forEach(code => {
        const withoutSeparators = code.replace(/-/g, '');
        for (const char of withoutSeparators) {
          charCounts.set(char, (charCounts.get(char) || 0) + 1);
        }
      });
      
      // With 1000 codes * 9 chars = 9000 total characters
      // Expected count per character: 9000 / 36 = 250
      // Allow for statistical variance (e.g., 100-400 range)
      charCounts.forEach((count, char) => {
        expect(count).toBeGreaterThan(100);
        expect(count).toBeLessThan(400);
      });
    });
  });
});

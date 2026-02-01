import { PairingCodeGenerator } from '../pairing-code-generator';

describe('PairingCodeGenerator', () => {
  let generator: PairingCodeGenerator;

  beforeEach(() => {
    generator = new PairingCodeGenerator();
  });

  describe('generate', () => {
    it('should generate a pairing code in XXX-XXX-XXX format', () => {
      const code = generator.generate();
      expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    });

    it('should generate a code with exactly 11 characters (including separators)', () => {
      const code = generator.generate();
      expect(code).toHaveLength(11);
    });

    it('should generate a code with exactly 9 characters (excluding separators)', () => {
      const code = generator.generate();
      const withoutSeparators = code.replace(/-/g, '');
      expect(withoutSeparators).toHaveLength(9);
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
  });

  describe('validate', () => {
    it('should validate correct pairing code format', () => {
      expect(generator.validate('ABC-123-XYZ')).toBe(true);
      expect(generator.validate('000-000-000')).toBe(true);
      expect(generator.validate('ZZZ-999-AAA')).toBe(true);
    });

    it('should reject codes with lowercase letters', () => {
      expect(generator.validate('abc-123-xyz')).toBe(false);
      expect(generator.validate('ABC-123-xyz')).toBe(false);
    });

    it('should reject codes without separators', () => {
      expect(generator.validate('ABC123XYZ')).toBe(false);
    });

    it('should reject codes with wrong separator positions', () => {
      expect(generator.validate('AB-C123-XYZ')).toBe(false);
      expect(generator.validate('ABC-12-3XYZ')).toBe(false);
    });

    it('should reject codes with wrong length', () => {
      expect(generator.validate('AB-123-XYZ')).toBe(false);
      expect(generator.validate('ABCD-123-XYZ')).toBe(false);
      expect(generator.validate('ABC-12-XYZ')).toBe(false);
    });

    it('should reject codes with special characters', () => {
      expect(generator.validate('ABC-12@-XYZ')).toBe(false);
      expect(generator.validate('ABC-123-XY!')).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(generator.validate(null as any)).toBe(false);
      expect(generator.validate(undefined as any)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(generator.validate('')).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(generator.validate(123 as any)).toBe(false);
      expect(generator.validate({} as any)).toBe(false);
      expect(generator.validate([] as any)).toBe(false);
    });
  });
});

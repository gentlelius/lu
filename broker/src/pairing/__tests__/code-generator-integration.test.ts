import { PairingCodeGenerator } from '../index';

describe('PairingCodeGenerator Integration', () => {
  it('should be importable from the pairing module', () => {
    expect(PairingCodeGenerator).toBeDefined();
  });

  it('should be instantiable and functional', () => {
    const generator = new PairingCodeGenerator();
    const code = generator.generate();
    
    expect(code).toBeDefined();
    expect(generator.validate(code)).toBe(true);
  });

  it('should generate valid codes that meet requirements', () => {
    const generator = new PairingCodeGenerator();
    
    for (let i = 0; i < 10; i++) {
      const code = generator.generate();
      
      // Requirement 1.1: 9 characters (excluding separators)
      expect(code.replace(/-/g, '')).toHaveLength(9);
      
      // Requirement 1.2: Only uppercase letters and digits
      expect(code.replace(/-/g, '')).toMatch(/^[A-Z0-9]+$/);
      
      // Requirement 1.3: Format XXX-XXX-XXX
      expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    }
  });
});

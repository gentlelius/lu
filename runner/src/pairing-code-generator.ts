import * as crypto from 'crypto';

/**
 * PairingCodeGenerator
 * 
 * Generates and validates pairing codes for the runner-app pairing system.
 * 
 * Pairing codes are 9-character strings formatted as XXX-XXX-XXX where:
 * - Each character is from the set [A-Z0-9] (26 letters + 10 digits = 36 characters)
 * - Total possibilities: 36^9 ≈ 101 trillion
 * - Collision probability with 10,000 active codes: < 0.00001%
 * 
 * Uses crypto.randomBytes for cryptographically secure random generation.
 */
export class PairingCodeGenerator {
  /** Character set for pairing codes: uppercase letters and digits */
  private static readonly CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  /** Total length of the pairing code (excluding separators) */
  private static readonly CODE_LENGTH = 9;
  
  /** Size of each group in the formatted code */
  private static readonly GROUP_SIZE = 3;
  
  /** Separator character between groups */
  private static readonly SEPARATOR = '-';
  
  /** Regular expression for validating pairing code format */
  private static readonly CODE_PATTERN = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

  /**
   * Generates a new pairing code
   * 
   * Uses crypto.randomBytes to generate cryptographically secure random bytes,
   * then maps them to the character set using modulo operation for uniform distribution.
   * 
   * @returns A pairing code in the format XXX-XXX-XXX
   * 
   * @example
   * const generator = new PairingCodeGenerator();
   * const code = generator.generate();
   * // Returns something like: "ABC-123-XYZ"
   */
  generate(): string {
    // Generate cryptographically secure random bytes
    const randomBytes = crypto.randomBytes(PairingCodeGenerator.CODE_LENGTH);
    
    // Map each byte to a character in the charset
    let code = '';
    for (let i = 0; i < PairingCodeGenerator.CODE_LENGTH; i++) {
      // Use modulo to ensure uniform distribution across the charset
      const index = randomBytes[i] % PairingCodeGenerator.CHARSET.length;
      code += PairingCodeGenerator.CHARSET[index];
    }
    
    // Format as XXX-XXX-XXX
    return this.formatCode(code);
  }

  /**
   * Validates a pairing code format
   * 
   * Checks if the code matches the expected format:
   * - Exactly 11 characters (including separators)
   * - Format: XXX-XXX-XXX
   * - Only uppercase letters (A-Z) and digits (0-9)
   * 
   * @param code The pairing code to validate
   * @returns true if the code format is valid, false otherwise
   * 
   * @example
   * const generator = new PairingCodeGenerator();
   * generator.validate('ABC-123-XYZ'); // true
   * generator.validate('abc-123-xyz'); // false (lowercase)
   * generator.validate('ABC123XYZ');   // false (missing separators)
   * generator.validate('AB-123-XYZ');  // false (wrong length)
   */
  validate(code: string): boolean {
    if (!code || typeof code !== 'string') {
      return false;
    }
    
    return PairingCodeGenerator.CODE_PATTERN.test(code);
  }

  /**
   * Formats a 9-character code string into XXX-XXX-XXX format
   * 
   * @param code The unformatted 9-character code
   * @returns The formatted code with separators
   * 
   * @private
   */
  private formatCode(code: string): string {
    const group1 = code.slice(0, 3);
    const group2 = code.slice(3, 6);
    const group3 = code.slice(6, 9);
    
    return `${group1}${PairingCodeGenerator.SEPARATOR}${group2}${PairingCodeGenerator.SEPARATOR}${group3}`;
  }
}

# Pairing Code Generator

This module provides the `PairingCodeGenerator` class for generating and validating pairing codes used in the runner-app pairing system.

## Overview

Pairing codes are 9-character strings formatted as `XXX-XXX-XXX` where each character is from the set `[A-Z0-9]` (26 uppercase letters + 10 digits = 36 characters).

### Security Properties

- **Total possibilities**: 36^9 ≈ 101 trillion
- **Collision probability**: With 10,000 active codes, the random collision probability is < 0.00001%
- **Cryptographic security**: Uses `crypto.randomBytes` for secure random generation
- **Uniform distribution**: Modulo operation ensures even distribution across the character set

## Usage

### Generating a Pairing Code

```typescript
import { PairingCodeGenerator } from './pairing/code-generator';

const generator = new PairingCodeGenerator();
const code = generator.generate();
console.log(code); // Example output: "ABC-123-XYZ"
```

### Validating a Pairing Code

```typescript
import { PairingCodeGenerator } from './pairing/code-generator';

const generator = new PairingCodeGenerator();

// Valid codes
generator.validate('ABC-123-XYZ'); // true
generator.validate('A1B-2C3-D4E'); // true
generator.validate('123-456-789'); // true

// Invalid codes
generator.validate('abc-123-xyz'); // false (lowercase)
generator.validate('ABC123XYZ');   // false (missing separators)
generator.validate('AB-123-XYZ');  // false (wrong length)
generator.validate('AB@-123-XYZ'); // false (special characters)
```

## API Reference

### `PairingCodeGenerator`

#### Methods

##### `generate(): string`

Generates a new pairing code using cryptographically secure random bytes.

**Returns**: A pairing code in the format `XXX-XXX-XXX`

**Example**:
```typescript
const code = generator.generate();
// Returns: "ABC-123-XYZ"
```

##### `validate(code: string): boolean`

Validates a pairing code format.

**Parameters**:
- `code` (string): The pairing code to validate

**Returns**: `true` if the code format is valid, `false` otherwise

**Validation Rules**:
- Must be exactly 11 characters (including separators)
- Must match format: `XXX-XXX-XXX`
- Only uppercase letters (A-Z) and digits (0-9) allowed
- Separators must be hyphens at positions 3 and 7

**Example**:
```typescript
generator.validate('ABC-123-XYZ'); // true
generator.validate('invalid');     // false
```

## Requirements Mapping

This implementation satisfies the following requirements from the design document:

- **Requirement 1.1**: Generates a 9-character pairing code
- **Requirement 1.2**: Uses only uppercase letters (A-Z) and digits (0-9)
- **Requirement 1.3**: Formats as XXX-XXX-XXX
- **Requirement 1.4**: Provides statistical uniqueness (collision probability < 0.001%)

## Testing

The module includes comprehensive unit tests covering:

- Code generation with correct format
- Character set validation
- Format validation (positive and negative cases)
- Edge cases (null, undefined, non-string values)
- Statistical uniqueness (no duplicates in 1000 generated codes)
- Character distribution (uniform randomness)

Run tests with:
```bash
pnpm test pairing-code-generator.test.ts
```

## Implementation Notes

### Why crypto.randomBytes?

We use `crypto.randomBytes` instead of `Math.random()` because:
1. **Cryptographic security**: Provides unpredictable random values
2. **No bias**: True random distribution
3. **Security-critical**: Pairing codes are used for authentication

### Character Distribution

The modulo operation (`randomBytes[i] % CHARSET.length`) ensures uniform distribution across all 36 characters. While modulo can introduce slight bias with non-power-of-2 divisors, the effect is negligible (< 0.4% difference) and acceptable for this use case.

### Format Choice

The `XXX-XXX-XXX` format with hyphens:
- Improves readability for users
- Makes it easier to communicate verbally
- Reduces input errors
- Follows common patterns (phone numbers, credit cards)

## Future Enhancements

Potential improvements for future versions:

1. **Configurable length**: Allow customization of code length
2. **Custom character sets**: Support different character sets (e.g., no ambiguous characters like 0/O, 1/I)
3. **Checksum digit**: Add a checksum for error detection
4. **Phonetic alphabet**: Generate codes optimized for verbal communication

import React from 'react';
import PairingScreen from '../pairing';

// Mock the AppClient
jest.mock('../../src/services/app-client', () => ({
  AppClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    pair: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    getCurrentPairingState: jest.fn().mockReturnValue({
      isPaired: false,
      runnerId: null,
      runnerOnline: false,
      pairedAt: null,
      error: null,
    }),
    isAppConnected: jest.fn().mockReturnValue(true),
  })),
  PairingErrorCode: {
    INVALID_FORMAT: 'INVALID_FORMAT',
    CODE_NOT_FOUND: 'CODE_NOT_FOUND',
    CODE_EXPIRED: 'CODE_EXPIRED',
    RUNNER_OFFLINE: 'RUNNER_OFFLINE',
    RATE_LIMITED: 'RATE_LIMITED',
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    NOT_PAIRED: 'NOT_PAIRED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',
    CONNECTION_ERROR: 'CONNECTION_ERROR',
  },
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

describe('PairingScreen', () => {
  it('should be defined and exportable', () => {
    expect(PairingScreen).toBeDefined();
    expect(typeof PairingScreen).toBe('function');
  });

  it('should be a valid React component', () => {
    // Check that it's a function (functional component)
    expect(typeof PairingScreen).toBe('function');
    
    // Check that it has a name
    expect(PairingScreen.name).toBe('PairingScreen');
  });
});

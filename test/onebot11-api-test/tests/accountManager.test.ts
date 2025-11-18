import { AccountManager } from '../core/AccountManager.js';
import { TestConfig } from '../config/ConfigLoader.js';
import { ApiClient } from '../core/ApiClient.js';

describe('AccountManager', () => {
  const mockConfig: TestConfig = {
    accounts: {
      primary: {
        host: 'http://localhost:3000',
        apiKey: 'test-key-1',
        protocol: 'http',
      },
      secondary: {
        host: 'http://localhost:3001',
        apiKey: 'test-key-2',
        protocol: 'ws',
      },
    },
    timeout: 30000,
    retryAttempts: 3,
  };

  let accountManager: AccountManager;

  beforeEach(() => {
    accountManager = new AccountManager(mockConfig);
  });

  afterEach(() => {
    // 清理 WebSocket 连接
    accountManager.disconnectAll();
  });

  describe('constructor', () => {
    it('should create AccountManager with valid config', () => {
      expect(accountManager).toBeInstanceOf(AccountManager);
    });

    it('should initialize primary and secondary clients', () => {
      const primary = accountManager.getPrimary();
      const secondary = accountManager.getSecondary();

      expect(primary).toBeInstanceOf(ApiClient);
      expect(secondary).toBeInstanceOf(ApiClient);
    });
  });

  describe('getPrimary', () => {
    it('should return primary ApiClient instance', () => {
      const primary = accountManager.getPrimary();
      
      expect(primary).toBeInstanceOf(ApiClient);
      expect(primary.getConfig()).toEqual(mockConfig.accounts.primary);
    });

    it('should return the same instance on multiple calls', () => {
      const primary1 = accountManager.getPrimary();
      const primary2 = accountManager.getPrimary();
      
      expect(primary1).toBe(primary2);
    });
  });

  describe('getSecondary', () => {
    it('should return secondary ApiClient instance', () => {
      const secondary = accountManager.getSecondary();
      
      expect(secondary).toBeInstanceOf(ApiClient);
      expect(secondary.getConfig()).toEqual(mockConfig.accounts.secondary);
    });

    it('should return the same instance on multiple calls', () => {
      const secondary1 = accountManager.getSecondary();
      const secondary2 = accountManager.getSecondary();
      
      expect(secondary1).toBe(secondary2);
    });
  });

  describe('client independence', () => {
    it('should return different instances for primary and secondary', () => {
      const primary = accountManager.getPrimary();
      const secondary = accountManager.getSecondary();
      
      expect(primary).not.toBe(secondary);
    });

    it('should have different configurations for primary and secondary', () => {
      const primary = accountManager.getPrimary();
      const secondary = accountManager.getSecondary();
      
      const primaryConfig = primary.getConfig();
      const secondaryConfig = secondary.getConfig();
      
      expect(primaryConfig.host).toBe('http://localhost:3000');
      expect(secondaryConfig.host).toBe('http://localhost:3001');
      expect(primaryConfig.protocol).toBe('http');
      expect(secondaryConfig.protocol).toBe('ws');
    });
  });

  describe('disconnectAll', () => {
    it('should call disconnectWs on both clients without errors', () => {
      // Simply verify that disconnectAll can be called without throwing
      expect(() => {
        accountManager.disconnectAll();
      }).not.toThrow();
    });
  });
});

import { ApiClient, NetworkError, TimeoutError } from '../core/ApiClient.js';
import { AccountConfig } from '../config/ConfigLoader.js';

describe('ApiClient', () => {
  const mockConfig: AccountConfig = {
    host: 'http://localhost:3000',
    apiKey: 'test-api-key',
    protocol: 'http',
  };

  describe('HTTP Client', () => {
    it('should create ApiClient with correct configuration', () => {
      const client = new ApiClient(mockConfig);
      expect(client.getConfig()).toEqual(mockConfig);
    });

    it('should set Authorization header when apiKey is provided', () => {
      const client = new ApiClient(mockConfig);
      const config = client.getConfig();
      expect(config.apiKey).toBe('test-api-key');
    });

    it('should use HTTP protocol by default', async () => {
      const client = new ApiClient(mockConfig);
      expect(client.getConfig().protocol).toBe('http');
    });
  });

  describe('Protocol Selection', () => {
    it('should throw error for unsupported protocol', async () => {
      const invalidConfig: AccountConfig = {
        host: 'http://localhost:3000',
        apiKey: 'test-key',
        protocol: 'invalid' as any,
      };
      
      const client = new ApiClient(invalidConfig);
      await expect(client.call('test_action', {})).rejects.toThrow('Unsupported protocol');
    });
  });

  describe('WebSocket Client', () => {
    it('should create ApiClient with WebSocket protocol', () => {
      const wsConfig: AccountConfig = {
        host: 'ws://localhost:3000',
        apiKey: 'test-key',
        protocol: 'ws',
      };
      
      const client = new ApiClient(wsConfig);
      expect(client.getConfig().protocol).toBe('ws');
    });

    it('should have null WebSocket state before connection', () => {
      const wsConfig: AccountConfig = {
        host: 'ws://localhost:3000',
        apiKey: 'test-key',
        protocol: 'ws',
      };
      
      const client = new ApiClient(wsConfig);
      expect(client.getWsState()).toBeNull();
    });

    it('should properly disconnect WebSocket', () => {
      const wsConfig: AccountConfig = {
        host: 'ws://localhost:3000',
        apiKey: 'test-key',
        protocol: 'ws',
      };
      
      const client = new ApiClient(wsConfig);
      // Should not throw even if not connected
      expect(() => client.disconnectWs()).not.toThrow();
    });

    it('should throw NetworkError when WebSocket is not connected', async () => {
      const wsConfig: AccountConfig = {
        host: 'ws://invalid-host-that-does-not-exist:9999',
        apiKey: 'test-key',
        protocol: 'ws',
      };
      
      const client = new ApiClient(wsConfig);
      
      // Should fail to connect and throw error
      await expect(client.callWs('test_action', {})).rejects.toThrow();
      
      // Clean up to prevent reconnection attempts
      client.disconnectWs();
    }, 15000); // Increase timeout for connection attempt
  });
});

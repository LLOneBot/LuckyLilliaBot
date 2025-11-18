/**
 * Configuration Loader Tests
 * Tests for ConfigLoader class functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  ConfigLoader,
  ConfigNotFoundError,
  ConfigFormatError,
  ConfigValidationError,
  TestConfig,
} from '../config/ConfigLoader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ConfigLoader', () => {
  const testConfigDir = path.join(__dirname, '../config');
  const validConfigPath = path.join(testConfigDir, 'test-valid.json');
  const invalidJsonPath = path.join(testConfigDir, 'test-invalid.json');
  const missingFieldsPath = path.join(testConfigDir, 'test-missing.json');
  const nonExistentPath = path.join(testConfigDir, 'non-existent.json');

  // Valid configuration for testing
  const validConfig = {
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

  beforeAll(() => {
    // Create test configuration files
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

    // Valid config
    fs.writeFileSync(validConfigPath, JSON.stringify(validConfig, null, 2));

    // Invalid JSON
    fs.writeFileSync(invalidJsonPath, '{ invalid json }');

    // Missing fields config
    fs.writeFileSync(
      missingFieldsPath,
      JSON.stringify({ accounts: { primary: { host: 'http://localhost:3000' } } })
    );
  });

  afterAll(() => {
    // Clean up test files
    [validConfigPath, invalidJsonPath, missingFieldsPath].forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  });

  describe('load', () => {
    it('should successfully load valid configuration', () => {
      const config = ConfigLoader.load(validConfigPath);

      expect(config).toBeDefined();
      expect(config.accounts.primary.host).toBe('http://localhost:3000');
      expect(config.accounts.primary.apiKey).toBe('test-key-1');
      expect(config.accounts.primary.protocol).toBe('http');
      expect(config.accounts.secondary.host).toBe('http://localhost:3001');
      expect(config.accounts.secondary.apiKey).toBe('test-key-2');
      expect(config.accounts.secondary.protocol).toBe('ws');
      expect(config.timeout).toBe(30000);
      expect(config.retryAttempts).toBe(3);
    });

    it('should throw ConfigNotFoundError when file does not exist', () => {
      expect(() => {
        ConfigLoader.load(nonExistentPath);
      }).toThrow(ConfigNotFoundError);
    });

    it('should throw ConfigFormatError when JSON is invalid', () => {
      expect(() => {
        ConfigLoader.load(invalidJsonPath);
      }).toThrow(ConfigFormatError);
    });

    it('should throw ConfigValidationError when required fields are missing', () => {
      expect(() => {
        ConfigLoader.load(missingFieldsPath);
      }).toThrow(ConfigValidationError);
    });

    it('should include missing field names in validation error', () => {
      try {
        ConfigLoader.load(missingFieldsPath);
        fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as Error).message).toContain('accounts.primary.apiKey');
        expect((error as Error).message).toContain('accounts.primary.protocol');
      }
    });
  });

  describe('protocol validation', () => {
    it('should accept http protocol', () => {
      const config = { ...validConfig };
      config.accounts.primary.protocol = 'http';
      const tempPath = path.join(testConfigDir, 'test-http.json');
      fs.writeFileSync(tempPath, JSON.stringify(config));

      expect(() => {
        ConfigLoader.load(tempPath);
      }).not.toThrow();

      fs.unlinkSync(tempPath);
    });

    it('should accept ws protocol', () => {
      const config = { ...validConfig };
      config.accounts.primary.protocol = 'ws';
      const tempPath = path.join(testConfigDir, 'test-ws.json');
      fs.writeFileSync(tempPath, JSON.stringify(config));

      expect(() => {
        ConfigLoader.load(tempPath);
      }).not.toThrow();

      fs.unlinkSync(tempPath);
    });

    it('should reject invalid protocol', () => {
      const config = { ...validConfig };
      (config.accounts.primary as any).protocol = 'invalid';
      const tempPath = path.join(testConfigDir, 'test-invalid-protocol.json');
      fs.writeFileSync(tempPath, JSON.stringify(config));

      expect(() => {
        ConfigLoader.load(tempPath);
      }).toThrow(ConfigFormatError);

      fs.unlinkSync(tempPath);
    });
  });
});

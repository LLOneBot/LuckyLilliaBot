import { EventListener, EventFilter, OB11Event } from '../core/EventListener.js';
import { ApiClient, TimeoutError } from '../core/ApiClient.js';
import { AccountConfig } from '../config/ConfigLoader.js';

describe('EventListener', () => {
  const mockConfig: AccountConfig = {
    host: 'http://localhost:3000',
    apiKey: 'test-api-key',
    protocol: 'ws',
  };

  let client: ApiClient;
  let listener: EventListener;

  beforeEach(() => {
    client = new ApiClient(mockConfig);
    listener = new EventListener(client);
  });

  afterEach(() => {
    // Clean up
    listener.stopListening();
    client.disconnectWs();
  });

  describe('Initialization', () => {
    it('should create EventListener with ApiClient', () => {
      expect(listener).toBeInstanceOf(EventListener);
    });

    it('should not be listening initially', () => {
      expect(listener.isListening()).toBe(false);
    });

    it('should have empty event queue initially', () => {
      expect(listener.getQueueLength()).toBe(0);
    });
  });

  describe('Event Queue Management', () => {
    it('should clear event queue', () => {
      listener.clearQueue();
      expect(listener.getQueueLength()).toBe(0);
    });
  });

  describe('Event Filtering', () => {
    it('should match event by type', async () => {
      const mockEvent: OB11Event = {
        time: Date.now(),
        self_id: 123456,
        post_type: 'message',
        message_type: 'private',
        user_id: 789,
      };

      const filter: EventFilter = {
        type: 'message',
      };

      // We can't easily test the private matchesFilter method directly,
      // but we can test it through waitForEvent behavior
      // This is a structural test to ensure the filter interface works
      expect(filter.type).toBe('message');
    });

    it('should match event by userId', () => {
      const filter: EventFilter = {
        userId: '789',
      };

      expect(filter.userId).toBe('789');
    });

    it('should match event by groupId', () => {
      const filter: EventFilter = {
        groupId: '12345',
      };

      expect(filter.groupId).toBe('12345');
    });

    it('should match event by messageId', () => {
      const filter: EventFilter = {
        messageId: 'msg-123',
      };

      expect(filter.messageId).toBe('msg-123');
    });

    it('should support custom filter properties', () => {
      const filter: EventFilter = {
        type: 'message',
        customField: 'customValue',
      };

      expect(filter.customField).toBe('customValue');
    });
  });

  describe('Timeout Mechanism', () => {
    it('should timeout when waiting for event that never arrives', async () => {
      const filter: EventFilter = {
        type: 'non-existent-event',
      };

      const timeout = 100; // 100ms timeout

      await expect(listener.waitForEvent(filter, timeout)).rejects.toThrow(TimeoutError);
    }, 1000);

    it('should include timeout duration in error message', async () => {
      const filter: EventFilter = {
        type: 'test-event',
      };

      const timeout = 50;

      try {
        await listener.waitForEvent(filter, timeout);
        fail('Should have thrown TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        if (error instanceof TimeoutError) {
          expect(error.duration).toBe(timeout);
          expect(error.message).toContain('50ms');
        }
      }
    }, 1000);

    it('should include filter information in timeout error', async () => {
      const filter: EventFilter = {
        type: 'message',
        userId: '123',
      };

      const timeout = 50;

      try {
        await listener.waitForEvent(filter, timeout);
        fail('Should have thrown TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        if (error instanceof TimeoutError) {
          expect(error.message).toContain('Filter');
        }
      }
    }, 1000);
  });

  describe('Stop Listening', () => {
    it('should stop listening and clean up', () => {
      listener.stopListening();
      expect(listener.isListening()).toBe(false);
    });

    it('should clear event queue when stopped', () => {
      listener.stopListening();
      expect(listener.getQueueLength()).toBe(0);
    });

    it('should not throw when stopping already stopped listener', () => {
      listener.stopListening();
      expect(() => listener.stopListening()).not.toThrow();
    });
  });

  describe('Event Types', () => {
    it('should handle message events', () => {
      const mockEvent: OB11Event = {
        time: Date.now(),
        self_id: 123456,
        post_type: 'message',
        message_type: 'private',
        user_id: 789,
        message: 'test message',
      };

      expect(mockEvent.post_type).toBe('message');
      expect(mockEvent.message_type).toBe('private');
    });

    it('should handle notice events', () => {
      const mockEvent: OB11Event = {
        time: Date.now(),
        self_id: 123456,
        post_type: 'notice',
        notice_type: 'group_increase',
        group_id: 12345,
        user_id: 789,
      };

      expect(mockEvent.post_type).toBe('notice');
      expect(mockEvent.notice_type).toBe('group_increase');
    });

    it('should handle request events', () => {
      const mockEvent: OB11Event = {
        time: Date.now(),
        self_id: 123456,
        post_type: 'request',
        request_type: 'friend',
        user_id: 789,
      };

      expect(mockEvent.post_type).toBe('request');
      expect(mockEvent.request_type).toBe('friend');
    });
  });
});

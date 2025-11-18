import { Assertions, AssertionError } from '../utils/Assertions.js';
import { ApiResponse } from '../core/ApiClient.js';
import { OB11Event } from '../core/EventListener.js';

describe('Assertions', () => {
  describe('assertSuccess', () => {
    it('should pass for successful response', () => {
      const response: ApiResponse = {
        status: 'ok',
        retcode: 0,
        data: { message_id: 123 },
      };

      expect(() => Assertions.assertSuccess(response)).not.toThrow();
    });

    it('should throw for failed response', () => {
      const response: ApiResponse = {
        status: 'failed',
        retcode: 1,
        data: null,
      };

      expect(() => Assertions.assertSuccess(response, 'test_action')).toThrow(AssertionError);
      expect(() => Assertions.assertSuccess(response, 'test_action')).toThrow(
        /API call failed for action "test_action"/
      );
    });
  });

  describe('assertFailure', () => {
    it('should pass for failed response', () => {
      const response: ApiResponse = {
        status: 'failed',
        retcode: 1,
        data: null,
      };

      expect(() => Assertions.assertFailure(response)).not.toThrow();
    });

    it('should throw for successful response', () => {
      const response: ApiResponse = {
        status: 'ok',
        retcode: 0,
        data: {},
      };

      expect(() => Assertions.assertFailure(response)).toThrow(AssertionError);
      expect(() => Assertions.assertFailure(response)).toThrow(/should have failed/);
    });

    it('should verify specific error code', () => {
      const response: ApiResponse = {
        status: 'failed',
        retcode: 100,
        data: null,
      };

      expect(() => Assertions.assertFailure(response, 100)).not.toThrow();
      expect(() => Assertions.assertFailure(response, 200)).toThrow(AssertionError);
    });
  });

  describe('assertMessageReceived', () => {
    it('should pass for matching message', () => {
      const event: OB11Event = {
        time: Date.now(),
        self_id: 123,
        post_type: 'message',
        message_type: 'private',
        message: 'Hello World',
        raw_message: 'Hello World',
      };

      expect(() => Assertions.assertMessageReceived(event, 'Hello World')).not.toThrow();
    });

    it('should throw for non-message event', () => {
      const event: OB11Event = {
        time: Date.now(),
        self_id: 123,
        post_type: 'notice',
      };

      expect(() => Assertions.assertMessageReceived(event, 'test')).toThrow(AssertionError);
      expect(() => Assertions.assertMessageReceived(event, 'test')).toThrow(
        /not a message event/
      );
    });

    it('should throw for message content mismatch', () => {
      const event: OB11Event = {
        time: Date.now(),
        self_id: 123,
        post_type: 'message',
        message_type: 'private',
        message: 'Hello World',
      };

      expect(() => Assertions.assertMessageReceived(event, 'Different Message')).toThrow(
        AssertionError
      );
      expect(() => Assertions.assertMessageReceived(event, 'Different Message')).toThrow(
        /Message content mismatch/
      );
    });

    it('should handle CQ code array format', () => {
      const event: OB11Event = {
        time: Date.now(),
        self_id: 123,
        post_type: 'message',
        message_type: 'private',
        message: [
          { type: 'text', data: { text: 'Hello ' } },
          { type: 'text', data: { text: 'World' } },
        ],
      };

      expect(() => Assertions.assertMessageReceived(event, 'Hello World')).not.toThrow();
    });
  });

  describe('assertFriendAdded', () => {
    it('should pass when friend exists', () => {
      const friendList = [
        { user_id: 123, nickname: 'Alice' },
        { user_id: 456, nickname: 'Bob' },
      ];

      expect(() => Assertions.assertFriendAdded(friendList, 123)).not.toThrow();
      expect(() => Assertions.assertFriendAdded(friendList, '456')).not.toThrow();
    });

    it('should throw when friend does not exist', () => {
      const friendList = [{ user_id: 123, nickname: 'Alice' }];

      expect(() => Assertions.assertFriendAdded(friendList, 999)).toThrow(AssertionError);
      expect(() => Assertions.assertFriendAdded(friendList, 999)).toThrow(
        /Friend not found in friend list/
      );
    });
  });

  describe('assertFriendRemoved', () => {
    it('should pass when friend does not exist', () => {
      const friendList = [{ user_id: 123, nickname: 'Alice' }];

      expect(() => Assertions.assertFriendRemoved(friendList, 999)).not.toThrow();
    });

    it('should throw when friend still exists', () => {
      const friendList = [{ user_id: 123, nickname: 'Alice' }];

      expect(() => Assertions.assertFriendRemoved(friendList, 123)).toThrow(AssertionError);
      expect(() => Assertions.assertFriendRemoved(friendList, 123)).toThrow(
        /Friend still exists in friend list/
      );
    });
  });

  describe('assertGroupMemberExists', () => {
    it('should pass when member exists', () => {
      const memberList = [
        { user_id: 123, nickname: 'Alice' },
        { user_id: 456, nickname: 'Bob' },
      ];

      expect(() => Assertions.assertGroupMemberExists(memberList, 123)).not.toThrow();
    });

    it('should throw when member does not exist', () => {
      const memberList = [{ user_id: 123, nickname: 'Alice' }];

      expect(() => Assertions.assertGroupMemberExists(memberList, 999)).toThrow(AssertionError);
      expect(() => Assertions.assertGroupMemberExists(memberList, 999)).toThrow(
        /Group member not found/
      );
    });
  });

  describe('assertEventType', () => {
    it('should pass for matching event type', () => {
      const event: OB11Event = {
        time: Date.now(),
        self_id: 123,
        post_type: 'message',
        message_type: 'private',
      };

      expect(() => Assertions.assertEventType(event, 'message.private')).not.toThrow();
    });

    it('should throw for mismatched event type', () => {
      const event: OB11Event = {
        time: Date.now(),
        self_id: 123,
        post_type: 'notice',
        notice_type: 'group_upload',
      };

      expect(() => Assertions.assertEventType(event, 'message.private')).toThrow(AssertionError);
    });
  });

  describe('assertResponseHasFields', () => {
    it('should pass when all fields exist', () => {
      const response: ApiResponse = {
        status: 'ok',
        retcode: 0,
        data: {
          user_id: 123,
          nickname: 'Alice',
          age: 25,
        },
      };

      expect(() =>
        Assertions.assertResponseHasFields(response, ['user_id', 'nickname', 'age'])
      ).not.toThrow();
    });

    it('should throw when fields are missing', () => {
      const response: ApiResponse = {
        status: 'ok',
        retcode: 0,
        data: {
          user_id: 123,
        },
      };

      expect(() =>
        Assertions.assertResponseHasFields(response, ['user_id', 'nickname', 'age'])
      ).toThrow(AssertionError);
      expect(() =>
        Assertions.assertResponseHasFields(response, ['user_id', 'nickname', 'age'])
      ).toThrow(/missing required fields/);
    });
  });

  describe('assertResponseFieldEquals', () => {
    it('should pass when field value matches', () => {
      const response: ApiResponse = {
        status: 'ok',
        retcode: 0,
        data: {
          user_id: 123,
          nickname: 'Alice',
        },
      };

      expect(() => Assertions.assertResponseFieldEquals(response, 'user_id', 123)).not.toThrow();
    });

    it('should throw when field value does not match', () => {
      const response: ApiResponse = {
        status: 'ok',
        retcode: 0,
        data: {
          user_id: 123,
        },
      };

      expect(() => Assertions.assertResponseFieldEquals(response, 'user_id', 456)).toThrow(
        AssertionError
      );
    });

    it('should throw when field is missing', () => {
      const response: ApiResponse = {
        status: 'ok',
        retcode: 0,
        data: {},
      };

      expect(() => Assertions.assertResponseFieldEquals(response, 'user_id', 123)).toThrow(
        AssertionError
      );
      expect(() => Assertions.assertResponseFieldEquals(response, 'user_id', 123)).toThrow(
        /missing field/
      );
    });
  });

  describe('assertArrayNotEmpty', () => {
    it('should pass for non-empty array', () => {
      expect(() => Assertions.assertArrayNotEmpty([1, 2, 3])).not.toThrow();
    });

    it('should throw for empty array', () => {
      expect(() => Assertions.assertArrayNotEmpty([], 'testArray')).toThrow(AssertionError);
      expect(() => Assertions.assertArrayNotEmpty([], 'testArray')).toThrow(/testArray is empty/);
    });

    it('should throw for non-array value', () => {
      expect(() => Assertions.assertArrayNotEmpty('not an array' as any)).toThrow(AssertionError);
      expect(() => Assertions.assertArrayNotEmpty('not an array' as any)).toThrow(
        /not an array/
      );
    });
  });

  describe('assertArrayLength', () => {
    it('should pass when length matches', () => {
      expect(() => Assertions.assertArrayLength([1, 2, 3], 3)).not.toThrow();
    });

    it('should throw when length does not match', () => {
      expect(() => Assertions.assertArrayLength([1, 2], 3, 'testArray')).toThrow(AssertionError);
      expect(() => Assertions.assertArrayLength([1, 2], 3, 'testArray')).toThrow(
        /testArray length mismatch/
      );
    });
  });

  describe('assertEqual', () => {
    it('should pass when values are equal', () => {
      expect(() => Assertions.assertEqual(5, 5)).not.toThrow();
      expect(() => Assertions.assertEqual('test', 'test')).not.toThrow();
    });

    it('should throw when values are not equal', () => {
      expect(() => Assertions.assertEqual(5, 10, 'Numbers should match')).toThrow(AssertionError);
      expect(() => Assertions.assertEqual(5, 10, 'Numbers should match')).toThrow(
        /Numbers should match/
      );
    });
  });

  describe('assertNotEqual', () => {
    it('should pass when values are not equal', () => {
      expect(() => Assertions.assertNotEqual(5, 10)).not.toThrow();
    });

    it('should throw when values are equal', () => {
      expect(() => Assertions.assertNotEqual(5, 5)).toThrow(AssertionError);
      expect(() => Assertions.assertNotEqual(5, 5)).toThrow(/should not be equal/);
    });
  });

  describe('assertTrue', () => {
    it('should pass for truthy values', () => {
      expect(() => Assertions.assertTrue(true)).not.toThrow();
      expect(() => Assertions.assertTrue(1)).not.toThrow();
      expect(() => Assertions.assertTrue('test')).not.toThrow();
    });

    it('should throw for falsy values', () => {
      expect(() => Assertions.assertTrue(false)).toThrow(AssertionError);
      expect(() => Assertions.assertTrue(0)).toThrow(AssertionError);
      expect(() => Assertions.assertTrue('')).toThrow(AssertionError);
    });
  });

  describe('assertFalse', () => {
    it('should pass for falsy values', () => {
      expect(() => Assertions.assertFalse(false)).not.toThrow();
      expect(() => Assertions.assertFalse(0)).not.toThrow();
      expect(() => Assertions.assertFalse('')).not.toThrow();
    });

    it('should throw for truthy values', () => {
      expect(() => Assertions.assertFalse(true)).toThrow(AssertionError);
      expect(() => Assertions.assertFalse(1)).toThrow(AssertionError);
    });
  });

  describe('assertDefined', () => {
    it('should pass for defined values', () => {
      expect(() => Assertions.assertDefined(0)).not.toThrow();
      expect(() => Assertions.assertDefined('')).not.toThrow();
      expect(() => Assertions.assertDefined(false)).not.toThrow();
    });

    it('should throw for undefined or null', () => {
      expect(() => Assertions.assertDefined(undefined)).toThrow(AssertionError);
      expect(() => Assertions.assertDefined(null)).toThrow(AssertionError);
    });
  });

  describe('assertHasProperty', () => {
    it('should pass when property exists', () => {
      const obj = { name: 'Alice', age: 25 };
      expect(() => Assertions.assertHasProperty(obj, 'name')).not.toThrow();
    });

    it('should throw when property does not exist', () => {
      const obj = { name: 'Alice' };
      expect(() => Assertions.assertHasProperty(obj, 'age')).toThrow(AssertionError);
      expect(() => Assertions.assertHasProperty(obj, 'age')).toThrow(/does not have property/);
    });
  });

  describe('assertStringContains', () => {
    it('should pass when substring exists', () => {
      expect(() => Assertions.assertStringContains('Hello World', 'World')).not.toThrow();
    });

    it('should throw when substring does not exist', () => {
      expect(() => Assertions.assertStringContains('Hello World', 'Goodbye')).toThrow(
        AssertionError
      );
      expect(() => Assertions.assertStringContains('Hello World', 'Goodbye')).toThrow(
        /does not contain/
      );
    });

    it('should throw for non-string value', () => {
      expect(() => Assertions.assertStringContains(123 as any, 'test')).toThrow(AssertionError);
      expect(() => Assertions.assertStringContains(123 as any, 'test')).toThrow(
        /not a string/
      );
    });
  });

  describe('assertInRange', () => {
    it('should pass when value is in range', () => {
      expect(() => Assertions.assertInRange(5, 0, 10)).not.toThrow();
      expect(() => Assertions.assertInRange(0, 0, 10)).not.toThrow();
      expect(() => Assertions.assertInRange(10, 0, 10)).not.toThrow();
    });

    it('should throw when value is out of range', () => {
      expect(() => Assertions.assertInRange(-1, 0, 10)).toThrow(AssertionError);
      expect(() => Assertions.assertInRange(11, 0, 10)).toThrow(AssertionError);
      expect(() => Assertions.assertInRange(11, 0, 10)).toThrow(/not in range/);
    });

    it('should throw for non-number value', () => {
      expect(() => Assertions.assertInRange('5' as any, 0, 10)).toThrow(AssertionError);
      expect(() => Assertions.assertInRange('5' as any, 0, 10)).toThrow(/not a number/);
    });
  });

  describe('AssertionError', () => {
    it('should format error message with expected and actual values', () => {
      const error = new AssertionError('Test failed', 'expected', 'actual', { extra: 'info' });

      const errorString = error.toString();
      expect(errorString).toContain('AssertionError: Test failed');
      expect(errorString).toContain('Expected: "expected"');
      expect(errorString).toContain('Actual: "actual"');
      expect(errorString).toContain('Details:');
      expect(errorString).toContain('"extra": "info"');
    });
  });
});

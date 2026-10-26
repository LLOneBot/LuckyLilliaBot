import { ApiResponse } from '../core/ApiClient.js';
import { OB11Event } from '../core/EventListener.js';

export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly expected?: unknown,
    public readonly actual?: unknown,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AssertionError';
  }

  toString(): string {
    let msg = `${this.name}: ${this.message}`;

    if (this.expected !== undefined) {
      msg += `\n  Expected: ${JSON.stringify(this.expected, null, 2)}`;
    }

    if (this.actual !== undefined) {
      msg += `\n  Actual: ${JSON.stringify(this.actual, null, 2)}`;
    }

    if (this.details !== undefined) {
      msg += `\n  Details: ${JSON.stringify(this.details, null, 2)}`;
    }

    return msg;
  }
}

export class Assertions {
  static assertSuccess(response: ApiResponse, action?: string): void {
    if (response.retcode !== 0) {
      throw new AssertionError(
        `API call failed${action ? ` for action "${action}"` : ''}`,
        { retcode: 0, status: 'ok' },
        response,
        { fullResponse: response }
      );
    }
  }

  static assertFailure(response: ApiResponse, expectedRetcode?: number, action?: string): void {
    if (response.retcode === 0) {
      throw new AssertionError(
        `API call should have failed${action ? ` for action "${action}"` : ''}`,
        { retcode: expectedRetcode || 'non-zero' },
        { retcode: response.retcode },
        { response }
      );
    }

    if (expectedRetcode !== undefined && response.retcode !== expectedRetcode) {
      throw new AssertionError(
        `API call failed with unexpected error code${action ? ` for action "${action}"` : ''}`,
        { retcode: expectedRetcode },
        { retcode: response.retcode },
        { response }
      );
    }
  }

  static assertMessageReceived(
    event: OB11Event,
    expectedMessage: string,
    messageType?: 'private' | 'group'
  ): void {
    if (event.post_type !== 'message') {
      throw new AssertionError(
        'Event is not a message event',
        { post_type: 'message' },
        { post_type: event.post_type },
        { event }
      );
    }

    if (messageType && event.message_type !== messageType) {
      throw new AssertionError(
        'Message type mismatch',
        { message_type: messageType },
        { message_type: event.message_type },
        { event }
      );
    }

    const actualMessage = this.extractMessageContent(event);

    if (actualMessage !== expectedMessage) {
      throw new AssertionError(
        'Message content mismatch',
        expectedMessage,
        actualMessage,
        { event }
      );
    }
  }

  static assertFriendAdded(friendList: any[], userId: string | number): void {
    const userIdStr = String(userId);
    const found = friendList.some((friend) => String(friend.user_id) === userIdStr);

    if (!found) {
      throw new AssertionError(
        'Friend not found in friend list',
        { userId: userIdStr, inList: true },
        { userId: userIdStr, inList: false },
        { friendList: friendList.map((f) => ({ user_id: f.user_id, nickname: f.nickname })) }
      );
    }
  }

  static assertFriendRemoved(friendList: any[], userId: string | number): void {
    const userIdStr = String(userId);
    const found = friendList.some((friend) => String(friend.user_id) === userIdStr);

    if (found) {
      throw new AssertionError(
        'Friend still exists in friend list',
        { userId: userIdStr, inList: false },
        { userId: userIdStr, inList: true },
        { friendList: friendList.map((f) => ({ user_id: f.user_id, nickname: f.nickname })) }
      );
    }
  }

  static assertGroupMemberExists(memberList: any[], userId: string | number): void {
    const userIdStr = String(userId);
    const found = memberList.some((member) => String(member.user_id) === userIdStr);

    if (!found) {
      throw new AssertionError(
        'Group member not found in member list',
        { userId: userIdStr, inList: true },
        { userId: userIdStr, inList: false },
        { memberCount: memberList.length }
      );
    }
  }

  static assertGroupMemberNotExists(memberList: any[], userId: string | number): void {
    const userIdStr = String(userId);
    const found = memberList.some((member) => String(member.user_id) === userIdStr);

    if (found) {
      throw new AssertionError(
        'Group member still exists in member list',
        { userId: userIdStr, inList: false },
        { userId: userIdStr, inList: true },
        { memberCount: memberList.length }
      );
    }
  }

  static assertEventType(event: OB11Event, expectedType: string): void {
    const actualType = this.getEventType(event);

    if (actualType !== expectedType) {
      throw new AssertionError(
        'Event type mismatch',
        expectedType,
        actualType,
        { event }
      );
    }
  }

  static assertResponseHasFields(response: ApiResponse, fields: string[]): void {
    const missingFields: string[] = [];

    for (const field of fields) {
      if (!(field in response.data)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new AssertionError(
        'Response data missing required fields',
        { fields },
        { missingFields },
        { availableFields: Object.keys(response.data) }
      );
    }
  }

  static assertResponseFieldEquals(
    response: ApiResponse,
    field: string,
    expectedValue: unknown
  ): void {
    if (!(field in response.data)) {
      throw new AssertionError(
        `Response data missing field "${field}"`,
        { [field]: expectedValue },
        { [field]: undefined },
        { availableFields: Object.keys(response.data) }
      );
    }

    const actualValue = response.data[field];

    if (actualValue !== expectedValue) {
      throw new AssertionError(
        `Response field "${field}" value mismatch`,
        expectedValue,
        actualValue,
        { response }
      );
    }
  }

  static assertArrayNotEmpty(array: unknown[], arrayName?: string): void {
    if (!Array.isArray(array)) {
      throw new AssertionError(
        `${arrayName || 'Value'} is not an array`,
        'array',
        typeof array
      );
    }

    if (array.length === 0) {
      throw new AssertionError(
        `${arrayName || 'Array'} is empty`,
        { length: '> 0' },
        { length: 0 }
      );
    }
  }

  static assertArrayLength(array: unknown[], expectedLength: number, arrayName?: string): void {
    if (!Array.isArray(array)) {
      throw new AssertionError(
        `${arrayName || 'Value'} is not an array`,
        'array',
        typeof array
      );
    }

    if (array.length !== expectedLength) {
      throw new AssertionError(
        `${arrayName || 'Array'} length mismatch`,
        { length: expectedLength },
        { length: array.length }
      );
    }
  }

  static assertEqual(actual: unknown, expected: unknown, message?: string): void {
    if (actual !== expected) {
      throw new AssertionError(
        message || 'Values are not equal',
        expected,
        actual
      );
    }
  }

  static assertDeepEqual(actual: unknown, expected: unknown, message?: string): void {
    if (!this.deepEqual(actual, expected)) {
      throw new AssertionError(
        message || 'Objects are not deeply equal',
        expected,
        actual
      );
    }
  }

  static assertNotEqual(actual: unknown, notExpected: unknown, message?: string): void {
    if (actual === notExpected) {
      throw new AssertionError(
        message || 'Values should not be equal',
        { not: notExpected },
        actual
      );
    }
  }

  static assertTrue(value: unknown, message?: string): void {
    if (!value) {
      throw new AssertionError(
        message || 'Value is not truthy',
        true,
        value
      );
    }
  }

  static assertFalse(value: unknown, message?: string): void {
    if (value) {
      throw new AssertionError(
        message || 'Value is not falsy',
        false,
        value
      );
    }
  }

  static assertDefined(value: unknown, message?: string): void {
    if (value === undefined || value === null) {
      throw new AssertionError(
        message || 'Value is undefined or null',
        'defined value',
        value
      );
    }
  }

  static assertHasProperty(obj: any, property: string, message?: string): void {
    if (!(property in obj)) {
      throw new AssertionError(
        message || `Object does not have property "${property}"`,
        { hasProperty: property },
        { hasProperty: false },
        { availableProperties: Object.keys(obj) }
      );
    }
  }

  static assertStringContains(str: string, substring: string, message?: string): void {
    if (typeof str !== 'string') {
      throw new AssertionError(
        'Value is not a string',
        'string',
        typeof str
      );
    }

    if (!str.includes(substring)) {
      throw new AssertionError(
        message || `String does not contain "${substring}"`,
        { contains: substring },
        { contains: false },
        { string: str }
      );
    }
  }

  static assertInRange(value: number, min: number, max: number, message?: string): void {
    if (typeof value !== 'number') {
      throw new AssertionError(
        'Value is not a number',
        'number',
        typeof value
      );
    }

    if (value < min || value > max) {
      throw new AssertionError(
        message || `Value is not in range [${min}, ${max}]`,
        { min, max },
        value
      );
    }
  }

  private static deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a == null || b == null) return a === b;

    if (typeof a !== typeof b) return false;

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (a instanceof RegExp && b instanceof RegExp) {
      return a.toString() === b.toString();
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!this.deepEqual(a[key], b[key])) return false;
      }

      return true;
    }

    return false;
  }

  private static extractMessageContent(event: OB11Event): string {
    if (typeof event.message === 'string') {
      return event.message;
    } else if (Array.isArray(event.message)) {
      return event.message
        .map((seg: any) => {
          if (seg.type === 'text') {
            return seg.data.text;
          }
          return '';
        })
        .join('');
    } else if (event.raw_message) {
      return event.raw_message;
    }
    return '';
  }

  private static getEventType(event: OB11Event): string {
    let type = event.post_type;

    if (event.post_type === 'message' && event.message_type) {
      type = `${type}.${event.message_type}`;
    }

    if (event.post_type === 'notice' && event.notice_type) {
      type = `${type}.${event.notice_type}`;
    }

    if (event.post_type === 'request' && event.request_type) {
      type = `${type}.${event.request_type}`;
    }

    return type;
  }
}

import { ApiResponse } from '../core/ApiClient.js';
import { OB11Event } from '../core/EventListener.js';

/**
 * 断言错误
 * 提供详细的错误信息，包括期望值和实际值
 */
export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly expected?: any,
    public readonly actual?: any,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AssertionError';
  }

  /**
   * 格式化错误信息
   */
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

/**
 * 断言工具类
 * 提供常用的断言方法，用于验证 OneBot11 接口的响应和事件
 */
export class Assertions {
  /**
   * 断言 API 响应成功
   * @param response API 响应对象
   * @param action 接口名称（用于错误信息）
   * @throws {AssertionError} 响应失败时抛出
   */
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

  /**
   * 断言 API 响应失败（用于测试错误处理）
   * @param response API 响应对象
   * @param expectedRetcode 期望的错误码（可选）
   * @param action 接口名称（用于错误信息）
   * @throws {AssertionError} 响应成功时抛出
   */
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

  /**
   * 断言消息已接收
   * @param event 接收到的事件
   * @param expectedMessage 期望的消息内容
   * @param messageType 消息类型（'private' 或 'group'）
   * @throws {AssertionError} 消息不匹配时抛出
   */
  static assertMessageReceived(
    event: OB11Event,
    expectedMessage: string,
    messageType?: 'private' | 'group'
  ): void {
    // 验证事件类型
    if (event.post_type !== 'message') {
      throw new AssertionError(
        'Event is not a message event',
        { post_type: 'message' },
        { post_type: event.post_type },
        { event }
      );
    }

    // 验证消息类型
    if (messageType && event.message_type !== messageType) {
      throw new AssertionError(
        'Message type mismatch',
        { message_type: messageType },
        { message_type: event.message_type },
        { event }
      );
    }

    // 提取消息内容
    const actualMessage = this.extractMessageContent(event);

    // 验证消息内容
    if (actualMessage !== expectedMessage) {
      throw new AssertionError(
        'Message content mismatch',
        expectedMessage,
        actualMessage,
        { event }
      );
    }
  }

  /**
   * 断言好友已添加
   * @param friendList 好友列表
   * @param userId 期望的好友用户 ID
   * @throws {AssertionError} 好友不在列表中时抛出
   */
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

  /**
   * 断言好友已删除
   * @param friendList 好友列表
   * @param userId 期望删除的好友用户 ID
   * @throws {AssertionError} 好友仍在列表中时抛出
   */
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

  /**
   * 断言群成员存在
   * @param memberList 群成员列表
   * @param userId 期望的成员用户 ID
   * @throws {AssertionError} 成员不在列表中时抛出
   */
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

  /**
   * 断言群成员不存在
   * @param memberList 群成员列表
   * @param userId 期望不存在的成员用户 ID
   * @throws {AssertionError} 成员仍在列表中时抛出
   */
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

  /**
   * 断言事件类型匹配
   * @param event 事件对象
   * @param expectedType 期望的事件类型
   * @throws {AssertionError} 事件类型不匹配时抛出
   */
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

  /**
   * 断言响应数据包含指定字段
   * @param response API 响应对象
   * @param fields 期望的字段列表
   * @throws {AssertionError} 缺少字段时抛出
   */
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

  /**
   * 断言响应数据字段值匹配
   * @param response API 响应对象
   * @param field 字段名
   * @param expectedValue 期望的值
   * @throws {AssertionError} 字段值不匹配时抛出
   */
  static assertResponseFieldEquals(
    response: ApiResponse,
    field: string,
    expectedValue: any
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

  /**
   * 断言数组不为空
   * @param array 数组
   * @param arrayName 数组名称（用于错误信息）
   * @throws {AssertionError} 数组为空时抛出
   */
  static assertArrayNotEmpty(array: any[], arrayName?: string): void {
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

  /**
   * 断言数组长度匹配
   * @param array 数组
   * @param expectedLength 期望的长度
   * @param arrayName 数组名称（用于错误信息）
   * @throws {AssertionError} 长度不匹配时抛出
   */
  static assertArrayLength(array: any[], expectedLength: number, arrayName?: string): void {
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

  /**
   * 断言值相等
   * @param actual 实际值
   * @param expected 期望值
   * @param message 错误信息
   * @throws {AssertionError} 值不相等时抛出
   */
  static assertEqual(actual: any, expected: any, message?: string): void {
    if (actual !== expected) {
      throw new AssertionError(
        message || 'Values are not equal',
        expected,
        actual
      );
    }
  }

  /**
   * 断言对象深度相等
   * @param actual 实际值
   * @param expected 期望值
   * @param message 错误信息
   * @throws {AssertionError} 对象不相等时抛出
   */
  static assertDeepEqual(actual: any, expected: any, message?: string): void {
    if (!this.deepEqual(actual, expected)) {
      throw new AssertionError(
        message || 'Objects are not deeply equal',
        expected,
        actual
      );
    }
  }

  /**
   * 断言值不相等
   * @param actual 实际值
   * @param notExpected 不期望的值
   * @param message 错误信息
   * @throws {AssertionError} 值相等时抛出
   */
  static assertNotEqual(actual: any, notExpected: any, message?: string): void {
    if (actual === notExpected) {
      throw new AssertionError(
        message || 'Values should not be equal',
        { not: notExpected },
        actual
      );
    }
  }

  /**
   * 断言值为真
   * @param value 值
   * @param message 错误信息
   * @throws {AssertionError} 值为假时抛出
   */
  static assertTrue(value: any, message?: string): void {
    if (!value) {
      throw new AssertionError(
        message || 'Value is not truthy',
        true,
        value
      );
    }
  }

  /**
   * 断言值为假
   * @param value 值
   * @param message 错误信息
   * @throws {AssertionError} 值为真时抛出
   */
  static assertFalse(value: any, message?: string): void {
    if (value) {
      throw new AssertionError(
        message || 'Value is not falsy',
        false,
        value
      );
    }
  }

  /**
   * 断言值已定义
   * @param value 值
   * @param message 错误信息
   * @throws {AssertionError} 值未定义时抛出
   */
  static assertDefined(value: any, message?: string): void {
    if (value === undefined || value === null) {
      throw new AssertionError(
        message || 'Value is undefined or null',
        'defined value',
        value
      );
    }
  }

  /**
   * 断言对象包含指定属性
   * @param obj 对象
   * @param property 属性名
   * @param message 错误信息
   * @throws {AssertionError} 对象不包含属性时抛出
   */
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

  /**
   * 断言字符串包含子串
   * @param str 字符串
   * @param substring 子串
   * @param message 错误信息
   * @throws {AssertionError} 字符串不包含子串时抛出
   */
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

  /**
   * 断言数字在范围内
   * @param value 数字
   * @param min 最小值
   * @param max 最大值
   * @param message 错误信息
   * @throws {AssertionError} 数字不在范围内时抛出
   */
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

  // ========== 辅助方法 ==========

  /**
   * 深度比较两个值是否相等
   * @param a 值 A
   * @param b 值 B
   * @returns 是否相等
   */
  private static deepEqual(a: any, b: any): boolean {
    // 严格相等检查
    if (a === b) return true;

    // null 或 undefined 检查
    if (a == null || b == null) return a === b;

    // 类型检查
    if (typeof a !== typeof b) return false;

    // 日期对象
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    // 正则表达式
    if (a instanceof RegExp && b instanceof RegExp) {
      return a.toString() === b.toString();
    }

    // 数组
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    // 对象
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

  /**
   * 从事件中提取消息内容
   * @param event 事件对象
   * @returns 消息内容字符串
   */
  private static extractMessageContent(event: OB11Event): string {
    if (typeof event.message === 'string') {
      return event.message;
    } else if (Array.isArray(event.message)) {
      // CQ 码数组格式
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

  /**
   * 获取事件的完整类型
   * @param event 事件对象
   * @returns 事件类型字符串
   */
  private static getEventType(event: OB11Event): string {
    let type = event.post_type;

    // 对于消息事件，添加消息类型
    if (event.post_type === 'message' && event.message_type) {
      type = `${type}.${event.message_type}`;
    }

    // 对于通知事件，添加通知类型
    if (event.post_type === 'notice' && event.notice_type) {
      type = `${type}.${event.notice_type}`;
    }

    // 对于请求事件，添加请求类型
    if (event.post_type === 'request' && event.request_type) {
      type = `${type}.${event.request_type}`;
    }

    return type;
  }
}

/**
 * Request 事件覆盖：
 * - friend (request_type='friend') — 加好友请求
 * - group/add (request_type='group', sub_type='add') — 主动加群请求
 * - group/invite (request_type='group', sub_type='invite') — 被邀入群请求
 *
 * 这三种 request 都需要**第三方账号**主动发起请求才能触发，单测环境下两个账号
 * 已经互为好友、共在测试群中，自我触发无效。下面的 it.skip 是有意保留的占位，
 * 提示这块只能靠手动验证或在自动化里挂第三个账号。
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { ActionName } from '@llbot/onebot11/action/types';

describe('request 事件覆盖（占位）', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('friend — 加好友请求（需要第三方账号）', async () => {
    void context;
    void ActionName;
  });

  it.skip('group.add — 加群请求（需要第三方账号）', async () => {
    void context;
    void ActionName;
  });

  it.skip('group.invite — 邀请入群请求（需要第三方账号）', async () => {
    void context;
    void ActionName;
  });
});

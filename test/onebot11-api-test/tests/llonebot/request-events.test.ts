/**
 * 加好友 / 加群 / 邀请入群的请求都要第三个账号发起: 两个测试账号已是好友且同群, 自己触发不了。
 * 下面的 it.skip 是占位, 只能手动验证
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

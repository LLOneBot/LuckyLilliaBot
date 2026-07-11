/**
 * Meta 事件覆盖：
 * - heartbeat（心跳）— 默认每 5s 一次
 * - lifecycle.connect — 连上 ws 时上报；HTTP 模式不存在，跳过
 *
 * 注：lifecycle 事件只在客户端首次连接 server 时上报；走 HTTP 不存在 lifecycle，
 * 走 WebSocket 时若 listener 注册晚于连接也错过。这里只测心跳。
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';

describe('meta_event 事件覆盖', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('heartbeat — 等下一个心跳事件（最长 30s）', async () => {
    context.twoAccountTest.clearAllQueues();
    const ev = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'meta_event',
      meta_event_type: 'heartbeat',
    }, undefined, 30000);
    Assertions.assertDefined((ev as any).interval, 'heartbeat 应该带 interval 字段');
    Assertions.assertDefined((ev as any).status, 'heartbeat 应该带 status 字段');
  }, 35000);
});

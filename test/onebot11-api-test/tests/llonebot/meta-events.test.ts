/** 只测心跳 (默认 5s 一次)。lifecycle 只在首次连上时报一次: HTTP 模式没有, WS 下 listener 注册晚了也会错过 */

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

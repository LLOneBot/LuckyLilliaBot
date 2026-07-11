/**
 * friend_poke 接口测试
 * 测试好友戳一戳功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('friend_poke - 好友戳一戳', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试戳一戳好友，raw_info 字段完整（jp/tp/uid）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.FriendPoke, {
      user_id: context.secondaryUserId
    });

    Assertions.assertSuccess(response, 'friend_poke');

    const event: any = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'poke',
      user_id: Number(context.primaryUserId),
    }, undefined, 10000);

    expect(Array.isArray(event.raw_info)).toBe(true);
    expect(event.raw_info.length).toBeGreaterThanOrEqual(3);

    const operatorSeg = event.raw_info[0];
    expect(operatorSeg.type).toBe('qq');
    expect(operatorSeg.uid).toBe(String(context.primaryUserId));
    expect(operatorSeg).toHaveProperty('jp');
    expect(operatorSeg).toHaveProperty('tp');
    expect(operatorSeg).toHaveProperty('nm');
    expect(operatorSeg.col).toBe('1');

    const actionSeg = event.raw_info[1];
    expect(actionSeg.type).toBe('nor');
    expect(actionSeg).toHaveProperty('txt');
    expect(actionSeg).toHaveProperty('jp');

    const targetSeg = event.raw_info[2];
    expect(targetSeg.type).toBe('qq');
    expect(targetSeg.uid).toBe(String(context.secondaryUserId));
    expect(targetSeg).toHaveProperty('jp');
    expect(targetSeg).toHaveProperty('tp');
  }, 30000);

  // 撤回戳一戳（friend）：同 group_poke，OneBot11 无 "取消戳" 标准 action，
  // 需在 QQ 客户端 2 分钟内手动取消，留 skip + 文档。
  it.skip('friend_poke 撤回（poke_recall）— 需在 QQ 客户端手动取消戳', async () => {
    // 操作步骤：
    //   1. primary 戳 secondary（私聊）
    //   2. primary 在 QQ 客户端 2 分钟内长按戳一戳灰条 → 选"取消戳"
    //   3. 期望 secondary 收到:
    //      { post_type: 'notice', notice_type: 'notify',
    //        sub_type: 'poke_recall', user_id, target_id }
  });
});

/**
 * group_poke 接口测试
 * 测试群戳一戳功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('group_poke - 群戳一戳', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试在群里戳一戳成员，raw_info 字段完整（jp/tp/uid）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GroupPoke, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId
    });

    Assertions.assertSuccess(response, 'group_poke');

    const event: any = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'poke',
      group_id: Number(context.testGroupId),
      user_id: Number(context.primaryUserId),
      target_id: Number(context.secondaryUserId),
    }, undefined, 10000);

    // raw_info 形状校验：兼容 OneBot11 / go-cqhttp 协议
    expect(Array.isArray(event.raw_info)).toBe(true);
    expect(event.raw_info.length).toBeGreaterThanOrEqual(3);

    // 第 1 项：操作者 qq 段
    const operatorSeg = event.raw_info[0];
    expect(operatorSeg.type).toBe('qq');
    expect(operatorSeg.uid).toBe(String(context.primaryUserId));
    expect(operatorSeg).toHaveProperty('jp');
    expect(operatorSeg).toHaveProperty('tp');
    expect(operatorSeg).toHaveProperty('nm');
    expect(operatorSeg.col).toBe('1');

    // 第 2 项：动作文本段
    const actionSeg = event.raw_info[1];
    expect(actionSeg.type).toBe('nor');
    expect(actionSeg).toHaveProperty('txt');
    expect(actionSeg).toHaveProperty('jp');
    expect(actionSeg.col).toBe('1');

    // 第 3 项：被戳者 qq 段
    const targetSeg = event.raw_info[2];
    expect(targetSeg.type).toBe('qq');
    expect(targetSeg.uid).toBe(String(context.secondaryUserId));
    expect(targetSeg).toHaveProperty('jp');
    expect(targetSeg).toHaveProperty('tp');
  }, 30000);

  // 撤回戳一戳：OneBot11 没有"取消戳"的标准 action，需要在 QQ 客户端
  // 2 分钟内点"取消戳"才能触发；目前没有自动化测试路径，留 skip + 文档。
  it.skip('group_poke 撤回（poke_recall）— 需在 QQ 客户端手动取消戳', async () => {
    // 操作步骤：
    //   1. primary 在群里戳 secondary
    //   2. primary 在 QQ 客户端 2 分钟内长按戳一戳灰条 → 选"取消戳"
    //   3. 期望 secondary 收到:
    //      { post_type: 'notice', notice_type: 'notify',
    //        sub_type: 'poke_recall', group_id, user_id, target_id }
    //   4. 同时 raw_info 应保留原 poke 时的字段
  });
});

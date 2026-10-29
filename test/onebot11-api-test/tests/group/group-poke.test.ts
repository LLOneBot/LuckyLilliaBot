import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

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

  // OneBot11 没有取消戳的 action, 只能在 QQ 客户端 2 分钟内手动取消
  it.skip('group_poke 撤回（poke_recall）— 需在 QQ 客户端手动取消戳', async () => {
    // primary 在群里戳 secondary, 再在 QQ 客户端长按灰条选"取消戳", secondary 应收到 raw_info 跟原 poke 一样的
    // { post_type: 'notice', notice_type: 'notify', sub_type: 'poke_recall', group_id, user_id, target_id }
  });
});

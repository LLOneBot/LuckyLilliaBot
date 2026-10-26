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

  // OneBot11 没有取消戳的 action, 只能在 QQ 客户端 2 分钟内手动取消
  it.skip('friend_poke 撤回（poke_recall）— 需在 QQ 客户端手动取消戳', async () => {
    // primary 私聊戳 secondary, 再在 QQ 客户端长按灰条选"取消戳", secondary 应收到
    // { post_type: 'notice', notice_type: 'notify', sub_type: 'poke_recall', user_id, target_id }
  });
});

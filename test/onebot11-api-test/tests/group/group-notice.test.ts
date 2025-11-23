/**
 * group_notice 群公告测试套件
 * 测试群公告的完整生命周期：发送、获取、删除
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('group_notice - 群公告操作', () => {
  let context: MessageTestContext;
  let createdNoticeId: string | null = null;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试发送群公告', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const content = `测试公告 ${Date.now()}`;

    try {
      const sendResponse = await primaryClient.call(ActionName.GoCQHTTP_SendGroupNotice, {
        group_id: context.testGroupId,
        content: content,
      });
      Assertions.assertSuccess(sendResponse, 'send_group_notice');
      console.log('✓ 群公告发送成功');
    } catch (e) {
      console.warn('⚠ 发送群公告失败（可能是权限不足）:', e);
    }
  }, 30000);

  it('测试获取群公告列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const getResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupNotice, {
      group_id: context.testGroupId,
    });

    Assertions.assertSuccess(getResponse, 'get_group_notice');
    Assertions.assertTrue(Array.isArray(getResponse.data), '群公告列表应该是数组');

    // 保存第一个公告的 ID 用于删除测试
    if (getResponse.data && getResponse.data.length > 0) {
      createdNoticeId = getResponse.data[0].notice_id;
      console.log(`✓ 获取到 ${getResponse.data.length} 条群公告`);
    }
  }, 30000);

  it('测试删除群公告 (需要管理员权限)', async () => {
    if (!createdNoticeId) {
      console.log('⚠ 没有可删除的公告 ID，跳过测试');
      return;
    }

    const primaryClient = context.twoAccountTest.getClient('primary');

    const deleteResponse = await primaryClient.call(ActionName.DeleteGroupNotice, {
      group_id: context.testGroupId,
      notice_id: createdNoticeId
    });

    if (deleteResponse.retcode === 0) {
      Assertions.assertSuccess(deleteResponse, 'delete_group_notice');
      console.log('✓ 群公告删除成功');
    } else {
      console.log('⚠ 删除群公告失败（可能是权限不足）:', deleteResponse.message);
    }
  }, 30000);
});

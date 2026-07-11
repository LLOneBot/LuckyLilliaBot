/**
 * get_group_file_system_info 接口测试
 * 测试取群文件系统信息（容量/文件数）
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('get_group_file_system_info - 群文件系统信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试取群文件系统信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFileSystemInfo, {
      group_id: context.testGroupId,
    });
    Assertions.assertSuccess(response, 'get_group_file_system_info');
    Assertions.assertResponseHasFields(response, [
      'file_count',
      'limit_count',
      'used_space',
      'total_space',
    ]);
    Assertions.assertTrue(response.data.total_space > 0, 'total_space should be positive');
  }, 30000);
});

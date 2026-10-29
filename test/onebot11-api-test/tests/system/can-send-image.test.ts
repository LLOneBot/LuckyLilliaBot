import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

describe('can_send_image - 检查是否可以发送图片', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试检查是否可以发送图片', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.CanSendImage, {});

    Assertions.assertSuccess(response, 'can_send_image');
    Assertions.assertResponseHasFields(response, ['yes']);
  }, 30000);
});

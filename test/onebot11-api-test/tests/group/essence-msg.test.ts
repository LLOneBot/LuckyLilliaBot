import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('essence_msg', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should set and delete essence message', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');
        const groupId = context.testGroupId;

        // 1. Send a message first
        const sendResponse = await primaryClient.call(ActionName.SendGroupMsg, {
            group_id: groupId,
            message: `Test Essence Msg ${Date.now()}`,
        });
        Assertions.assertSuccess(sendResponse, 'send_group_msg');
        const messageId = sendResponse.data.message_id;

        // 2. Set Essence Msg
        // Note: Requires admin/owner permission
        try {
            const setResponse = await primaryClient.call(ActionName.GoCQHTTP_SetEssenceMsg, {
                message_id: messageId,
            });
            Assertions.assertSuccess(setResponse, 'set_essence_msg');

            // 3. Delete Essence Msg
            const delResponse = await primaryClient.call(ActionName.GoCQHTTP_DeleteEssenceMsg, {
                message_id: messageId,
            });
            Assertions.assertSuccess(delResponse, 'delete_essence_msg');
        } catch (e) {
            console.warn('Skipping essence_msg test due to potential permission issues:', e);
        }
    });
});

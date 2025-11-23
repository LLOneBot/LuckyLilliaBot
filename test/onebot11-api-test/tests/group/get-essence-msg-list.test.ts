import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '../../../../src/onebot11/action/types.js';

describe('get_essence_msg_list', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should return essence msg list', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');

        const response = await primaryClient.call(ActionName.GoCQHTTP_GetEssenceMsgList, {
            group_id: context.testGroupId,
        });

        Assertions.assertSuccess(response, 'get_essence_msg_list');
        // Note: The list might be empty, so we just check if it's an array
        expect(Array.isArray(response.data)).toBe(true);
    });
});

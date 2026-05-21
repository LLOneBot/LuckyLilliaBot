import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { MediaPaths } from '@/tests/media';

describe('set_group_portrait', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    // server 把 Linux bot appId 在 highway cmd=3000 上的权限关掉了，
    // 即使本号是群主也会返回 "No Perm"。客户端无法绕过。
    it.skip('should set group portrait (server-side blocks Linux bot appId)', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');

        const response = await primaryClient.call(ActionName.GoCQHTTP_SetGroupPortrait, {
            group_id: context.testGroupId,
            file: MediaPaths.testOcrImageUrl,
        });
        Assertions.assertSuccess(response, 'set_group_portrait');
    });
});

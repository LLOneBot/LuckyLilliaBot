/**
 * group_file 接口测试 — 上传到指定文件夹的完整生命周期
 *   group_file_operations.test.ts 已经覆盖了"上传到根目录"，
 *   这里只测带 folder_id 的上传，确保文件确实落在该文件夹里、不在根目录。
 *   流程：建文件夹 → 上传到文件夹 → 在该文件夹里能看到文件 → 验证根目录里没有 →
 *        拿下载链接 → 删文件 → 删文件夹
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('group_file - 上传到指定文件夹', () => {
    let context: MessageTestContext;
    let folderId: string | null = null;
    let folderName: string | null = null;
    let fileId: string | null = null;
    let fileName: string | null = null;
    // 用作上传内容 + 下载比对的 ground truth
    const fileContent = Buffer.from(`upload-into-folder test content ${Date.now()} ${Math.random()}`)

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('建一个测试文件夹', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');
        folderName = `TestUploadFolder_${Date.now()}`;
        const res = await primaryClient.call(ActionName.GoCQHTTP_CreateGroupFileFolder, {
            group_id: context.testGroupId,
            name: folderName,
        });
        Assertions.assertSuccess(res, 'create_group_file_folder');
        Assertions.assertResponseHasFields(res, ['folder_id']);
        folderId = res.data.folder_id;
    }, 30000);

    it('上传文件到该文件夹', async () => {
        if (!folderId) {
            throw new Error('上一步建文件夹失败');
        }
        const primaryClient = context.twoAccountTest.getClient('primary');
        const content = fileContent.toString('base64');
        fileName = `infolder-${Date.now()}.txt`;
        const res = await primaryClient.call(ActionName.GoCQHTTP_UploadGroupFile, {
            group_id: context.testGroupId,
            file: `base64://${content}`,
            name: fileName,
            folder_id: folderId,
        });
        Assertions.assertSuccess(res, 'upload_group_file');
        Assertions.assertResponseHasFields(res, ['file_id']);
        fileId = res.data.file_id;
    }, 60000);

    it('文件夹里能查到该文件', async () => {
        if (!folderId || !fileId) {
            throw new Error('前置步骤失败');
        }
        await new Promise(r => setTimeout(r, 2000));
        const primaryClient = context.twoAccountTest.getClient('primary');
        const res = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFilesByFolder, {
            group_id: context.testGroupId,
            folder_id: folderId,
        });
        Assertions.assertSuccess(res, 'get_group_files_by_folder');
        const found = res.data.files.find((f: any) => f.file_id === fileId);
        expect(found).toBeDefined();
    }, 30000);

    it('根目录里不应该有该文件', async () => {
        if (!fileName) {
            throw new Error('前置步骤失败');
        }
        const primaryClient = context.twoAccountTest.getClient('primary');
        const res = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
            group_id: context.testGroupId,
        });
        Assertions.assertSuccess(res, 'get_group_root_files');
        const leaked = res.data.files.find((f: any) => f.file_name === fileName);
        expect(leaked).toBeUndefined();
    }, 30000);

    it('能拿到该文件的下载链接，且下载内容与上传一致', async () => {
        if (!fileId) {
            throw new Error('前置步骤失败');
        }
        const primaryClient = context.twoAccountTest.getClient('primary');
        const res = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFileUrl, {
            group_id: context.testGroupId,
            file_id: fileId,
        });
        Assertions.assertSuccess(res, 'get_group_file_url');
        Assertions.assertResponseHasFields(res, ['url']);
        expect(res.data.url).toBeTruthy();

        // 真的把文件下载下来，比对字节
        const downloadResp = await fetch(res.data.url);
        expect(downloadResp.ok).toBe(true);
        const downloaded = Buffer.from(await downloadResp.arrayBuffer());
        expect(downloaded.length).toBe(fileContent.length);
        expect(downloaded.equals(fileContent)).toBe(true);
    }, 30000);

    it('删除文件', async () => {
        if (!fileId) {
            throw new Error('前置步骤失败');
        }
        const primaryClient = context.twoAccountTest.getClient('primary');
        const res = await primaryClient.call(ActionName.GoCQHTTP_DeleteGroupFile, {
            group_id: context.testGroupId,
            file_id: fileId,
            busid: 102,
        });
        Assertions.assertSuccess(res, 'delete_group_file');
    }, 30000);

    it('删除文件夹', async () => {
        if (!folderId) {
            throw new Error('前置步骤失败');
        }
        const primaryClient = context.twoAccountTest.getClient('primary');
        const res = await primaryClient.call(ActionName.GoCQHTTP_DeleteGroupFolder, {
            group_id: context.testGroupId,
            folder_id: folderId,
        });
        Assertions.assertSuccess(res, 'delete_group_folder');
    }, 30000);
});

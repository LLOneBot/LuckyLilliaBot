import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { MediaPaths } from '@/tests/media';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('group_file - 群文件操作', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();

    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should handle group file operations', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');
        const groupId = context.testGroupId;

        // 1. Get Group File System Info
        const infoResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFileSystemInfo, {
            group_id: groupId,
        });
        Assertions.assertSuccess(infoResponse, 'get_group_file_system_info');
        Assertions.assertResponseHasFields(infoResponse, [
            'file_count',
            'limit_count',
            'used_space',
            'total_space',
        ]);

        // 2. Create Group File Folder
        const folderName = `TestFolder_${Date.now()}`;
        const createFolderResponse = await primaryClient.call(ActionName.GoCQHTTP_CreateGroupFileFolder, {
            group_id: groupId,
            name: folderName,
        });
        Assertions.assertSuccess(createFolderResponse, 'create_group_file_folder');
        const folderId = createFolderResponse.data.folder_id;

        // 3. Upload Group File
        const uploadResponse = await primaryClient.call(ActionName.GoCQHTTP_UploadGroupFile, {
            group_id: groupId,
            file: MediaPaths.testVideoUrl,
            name: 'test.mp4',
            folder_id: folderId,
        });
        Assertions.assertSuccess(uploadResponse, 'upload_group_file');
        const fileId = uploadResponse.data.file_id;

        // 4. Get Group Root Files
        const rootFilesResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
            group_id: groupId,
        });
        Assertions.assertSuccess(rootFilesResponse, 'get_group_root_files');
        expect(Array.isArray(rootFilesResponse.data.files)).toBe(true);
        expect(Array.isArray(rootFilesResponse.data.folders)).toBe(true);

        // 5. Get Group Files By Folder
        const filesByFolderResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFilesByFolder, {
            group_id: groupId,
            folder_id: folderId,
        });
        Assertions.assertSuccess(filesByFolderResponse, 'get_group_files_by_folder');
        const uploadedFile = filesByFolderResponse.data.files.find((f: any) => f.file_id === fileId);
        expect(uploadedFile).toBeDefined();

        // 6. Get Group File URL
        const fileUrlResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFileUrl, {
            group_id: groupId,
            file_id: fileId,
        });
        Assertions.assertSuccess(fileUrlResponse, 'get_group_file_url');
        expect(fileUrlResponse.data.url).toBeDefined();

        // 7. Delete Group File
        const delFileResponse = await primaryClient.call(ActionName.GoCQHTTP_DeleteGroupFile, {
            group_id: groupId,
            file_id: fileId,
            busid: 102, // Default busid
        });
        Assertions.assertSuccess(delFileResponse, 'delete_group_file');

        // 8. Delete Group Folder
        const delFolderResponse = await primaryClient.call(ActionName.GoCQHTTP_DeleteGroupFolder, {
            group_id: groupId,
            folder_id: folderId,
        });
        Assertions.assertSuccess(delFolderResponse, 'delete_group_folder');
    }, 60000); // Increase timeout for file operations
});

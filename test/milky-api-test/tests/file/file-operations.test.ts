import { setupMilkyTest, teardownMilkyTest, MilkyTestContext } from '../setup'
import { Assertions } from '@/protocol/Assertions'
import { MediaPaths } from '../media'

describe('Milky 文件操作', () => {
  let ctx: MilkyTestContext

  beforeAll(async () => {
    ctx = await setupMilkyTest()
  })

  afterAll(() => {
    teardownMilkyTest(ctx)
  })

  // milky 协议：upload_private_file 只返 file_id，没有 file_hash；
  // get_private_file_download_url 需要 file_hash（接收方从 friend_file_upload 事件里拿）。
  // 双账号自调测场景下 sender 拿不到 hash，测试用 it.skip 占位。
  it.skip('upload_private_file → get_private_file_download_url: 双账号场景受限', async () => {
    // TODO: 在 secondary 端监听 friend_file_upload 事件拿到 file_hash 再调用 download_url
  })

  it('upload_private_file: 上传成功并返回 file_id', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const fileName = `milky-priv-${Date.now()}.gif`
    const uploadRes = await primary.call<{ file_id: string }>('upload_private_file', {
      user_id: ctx.secondaryUserId,
      file_uri: MediaPaths.testGifUri,
      file_name: fileName,
    })
    Assertions.assertSuccess(uploadRes, 'upload_private_file')
    Assertions.assertDefined(uploadRes.data?.file_id, 'upload_private_file.data.file_id')
  }, 60000)

  it('upload_group_file + get_group_files + get_group_file_download_url + delete_group_file', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const fileName = `milky-grp-${Date.now()}.gif`

    const uploadRes = await primary.call<{ file_id: string }>('upload_group_file', {
      group_id: ctx.testGroupId,
      file_uri: MediaPaths.testGifUri,
      file_name: fileName,
    })
    Assertions.assertSuccess(uploadRes, 'upload_group_file')
    const fileId = uploadRes.data?.file_id
    Assertions.assertDefined(fileId, 'upload_group_file.data.file_id')

    await new Promise((r) => setTimeout(r, 2000))

    const listRes = await primary.call<{ files: Array<{ file_id: string; file_name: string }> }>(
      'get_group_files',
      { group_id: ctx.testGroupId },
    )
    Assertions.assertSuccess(listRes, 'get_group_files')
    const found = listRes.data?.files?.find((f) => f.file_id === fileId || f.file_name === fileName)
    expect(found).toBeDefined()

    const urlRes = await primary.call<{ download_url: string }>('get_group_file_download_url', {
      group_id: ctx.testGroupId,
      file_id: fileId!,
    })
    Assertions.assertSuccess(urlRes, 'get_group_file_download_url')
    expect((urlRes.data?.download_url ?? '').length).toBeGreaterThan(0)

    const delRes = await primary.call('delete_group_file', {
      group_id: ctx.testGroupId,
      file_id: fileId!,
    })
    Assertions.assertSuccess(delRes, 'delete_group_file')
  }, 90000)

  it('create_group_folder + rename_group_folder + delete_group_folder', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')
    const folderName = `milky-folder-${Date.now()}`

    const createRes = await primary.call<{ folder_id: string }>('create_group_folder', {
      group_id: ctx.testGroupId,
      folder_name: folderName,
    })
    Assertions.assertSuccess(createRes, 'create_group_folder')
    const folderId = createRes.data?.folder_id
    Assertions.assertDefined(folderId, 'create_group_folder.data.folder_id')

    await new Promise((r) => setTimeout(r, 1500))

    const renameRes = await primary.call('rename_group_folder', {
      group_id: ctx.testGroupId,
      folder_id: folderId!,
      new_folder_name: `${folderName}-renamed`,
    })
    Assertions.assertSuccess(renameRes, 'rename_group_folder')

    await new Promise((r) => setTimeout(r, 1000))

    const delRes = await primary.call('delete_group_folder', {
      group_id: ctx.testGroupId,
      folder_id: folderId!,
    })
    Assertions.assertSuccess(delRes, 'delete_group_folder')
  }, 60000)

  it('move_group_file + rename_group_file: 上传 → 进文件夹 → 重命名 → 清理', async () => {
    const primary = ctx.twoAccountTest.getClient('primary')

    // 1. 建文件夹
    const folderName = `milky-mv-folder-${Date.now()}`
    const folderRes = await primary.call<{ folder_id: string }>('create_group_folder', {
      group_id: ctx.testGroupId,
      folder_name: folderName,
    })
    Assertions.assertSuccess(folderRes, 'create_group_folder')
    const folderId = folderRes.data!.folder_id

    // 2. 在根目录上传一个文件
    const fileName = `milky-mv-file-${Date.now()}.gif`
    const uploadRes = await primary.call<{ file_id: string }>('upload_group_file', {
      group_id: ctx.testGroupId,
      file_uri: MediaPaths.testGifUri,
      file_name: fileName,
    })
    Assertions.assertSuccess(uploadRes, 'upload_group_file')
    const fileId = uploadRes.data!.file_id
    await new Promise((r) => setTimeout(r, 1500))

    // 3. 移动到文件夹
    const moveRes = await primary.call('move_group_file', {
      group_id: ctx.testGroupId,
      file_id: fileId,
      parent_folder_id: '/',
      target_folder_id: folderId,
    })
    Assertions.assertSuccess(moveRes, 'move_group_file')
    await new Promise((r) => setTimeout(r, 1500))

    // 4. 重命名
    const renameRes = await primary.call('rename_group_file', {
      group_id: ctx.testGroupId,
      file_id: fileId,
      parent_folder_id: folderId,
      new_file_name: `renamed-${fileName}`,
    })
    Assertions.assertSuccess(renameRes, 'rename_group_file')
    await new Promise((r) => setTimeout(r, 1000))

    // 5. 清理：先删文件，再删文件夹
    await primary.call('delete_group_file', { group_id: ctx.testGroupId, file_id: fileId }).catch(() => undefined)
    await primary.call('delete_group_folder', { group_id: ctx.testGroupId, folder_id: folderId }).catch(() => undefined)
  }, 120000)
})

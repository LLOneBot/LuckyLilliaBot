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

  it('upload_private_file → friend_file_upload event → get_private_file_download_url', async () => {
    // 双账号端到端：
    //   1. primary 上传文件给 secondary，拿 file_id
    //   2. secondary 收到 friend_file_upload 事件（file_hash 在事件 payload 里，
    //      milky transform 现在直接取 fileElement.fileMd5）
    //   3. primary 用 file_id + secondary 拿到的 hash 调 get_private_file_download_url
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const fileName = `milky-priv-${Date.now()}.gif`

    const uploadRes = await primary.call<{ file_id: string }>('upload_private_file', {
      user_id: ctx.secondaryUserId,
      file_uri: MediaPaths.testGifUri,
      file_name: fileName,
    })
    Assertions.assertSuccess(uploadRes, 'upload_private_file')
    const fileId = uploadRes.data?.file_id
    Assertions.assertDefined(fileId, 'upload_private_file.data.file_id')

    const ev = await ctx.twoAccountTest.secondaryListener.waitForEvent(
      { event_type: 'friend_file_upload' },
      (e) => e.data?.file_id === fileId,
      20000,
    )
    const fileHash = ev.data?.file_hash as string
    Assertions.assertDefined(fileHash, 'friend_file_upload.data.file_hash')
    expect(fileHash.length).toBeGreaterThan(0)

    const urlRes = await primary.call<{ download_url: string }>('get_private_file_download_url', {
      user_id: ctx.secondaryUserId,
      file_id: fileId!,
      file_hash: fileHash,
    })
    Assertions.assertSuccess(urlRes, 'get_private_file_download_url')
    expect(typeof urlRes.data?.download_url).toBe('string')
    expect((urlRes.data?.download_url ?? '').length).toBeGreaterThan(0)
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

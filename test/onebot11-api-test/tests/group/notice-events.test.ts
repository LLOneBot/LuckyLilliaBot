/**
 * Notice 事件覆盖：
 * - friend_recall（私聊撤回）
 * - group_card（群名片变更）
 * - group_admin（管理员变更）
 * - group_ban（禁言/解禁）
 * - group_upload（群文件上传）
 * - group_essence（精华）
 * - group_msg_emoji_like（表情回应）
 * - group_title（群头衔变更，notice_type=notify sub_type=title）
 *
 * 已覆盖的（在别处）：group_recall、notify(poke)、notify(profile_like)
 *
 * 未覆盖（需求第三方/破坏性）：
 * - friend_add（需要 unfriend → re-add）
 * - group_increase / group_decrease（需要 kick / re-invite，会破坏测试群成员关系）
 * - group_dismiss（解散群，破坏性）
 * - flash_file（依赖闪传上传成功，目前 prep 阶段被服务器拦）
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageData, OB11MessageDataType } from '@llbot/onebot11/types';
import { MediaPaths } from '../media';

describe('notice 事件覆盖', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('friend_recall — primary 发私聊给 secondary 后撤回，双方都收到 friend_recall', async () => {
    // 撤回方收到 0x210 sub=139 (FriendSelfRecall)，接收方收到 sub=138 (FriendRecall)。
    // 双方算出的 shortId 一致（C2C uniqueMsgId 用 (uid pair, msgRandom) 哈希，双端可对齐）。
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');
    const sendResp = await primary.call(ActionName.SendPrivateMsg, {
      user_id: context.secondaryUserId,
      message: [{ type: OB11MessageDataType.Text, data: { text: `recall test ${Date.now()}` } }] as OB11MessageData[],
    });
    Assertions.assertSuccess(sendResp, 'send_private_msg');
    const messageId = sendResp.data.message_id;

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'private',
      message_id: messageId,
    });
    await new Promise(r => setTimeout(r, 800));

    const delResp = await primary.call(ActionName.DeleteMsg, { message_id: messageId });
    Assertions.assertSuccess(delResp, 'delete_msg');

    await Promise.all([
      context.twoAccountTest.primaryListener.waitForEvent({
        post_type: 'notice',
        notice_type: 'friend_recall',
        message_id: messageId,
      }, undefined, 15000),
      context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'notice',
        notice_type: 'friend_recall',
        message_id: messageId,
      }, undefined, 15000),
    ]);
  }, 60000);

  it('group_card — primary 改 secondary 的群名片，secondary 在群里发言后收到 group_card', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');
    const secondary = context.twoAccountTest.getClient('secondary');
    const newCard = `card-test-${Date.now()}`;

    const resp = await primary.call(ActionName.SetGroupCard, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      card: newCard,
    });
    Assertions.assertSuccess(resp, 'set_group_card');

    // QQ NT 直连协议没有"名片变更"专属推送，secondary 端要先在群里说一句话
    // 让 sendMemberName 流回来，bot 才能对比 cache 触发 group_card 事件。
    await secondary.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: 'group_card-trigger',
    });

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'group_card',
      group_id: Number(context.testGroupId),
      user_id: Number(context.secondaryUserId),
    }, undefined, 15000);

    // 还原
    await primary.call(ActionName.SetGroupCard, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      card: '',
    });
  }, 60000);

  it('group_admin — primary 把 secondary 设/取消管理员，secondary 收到 group_admin', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');

    await primary.call(ActionName.SetGroupAdmin, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      enable: true,
    });
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'group_admin',
      sub_type: 'set',
      group_id: Number(context.testGroupId),
      user_id: Number(context.secondaryUserId),
    }, undefined, 15000);

    await primary.call(ActionName.SetGroupAdmin, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      enable: false,
    });
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'group_admin',
      sub_type: 'unset',
      group_id: Number(context.testGroupId),
      user_id: Number(context.secondaryUserId),
    }, undefined, 15000);
  }, 60000);

  it('group_ban — 禁言/解禁 secondary，收到 group_ban', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');

    await primary.call(ActionName.SetGroupBan, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      duration: 60,
    });
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'group_ban',
      sub_type: 'ban',
      group_id: Number(context.testGroupId),
      user_id: Number(context.secondaryUserId),
    }, undefined, 15000);

    await primary.call(ActionName.SetGroupBan, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      duration: 0,
    });
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'group_ban',
      sub_type: 'lift_ban',
      group_id: Number(context.testGroupId),
      user_id: Number(context.secondaryUserId),
    }, undefined, 15000);
  }, 60000);

  it('group_upload — primary 上传群文件，secondary 收到 group_upload', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');

    const fileName = `upload-notice-${Date.now()}.txt`;
    const upResp = await primary.call(ActionName.GoCQHTTP_UploadGroupFile, {
      group_id: context.testGroupId,
      file: MediaPaths.getPath('test_ocr.png'),
      name: fileName,
    });
    Assertions.assertSuccess(upResp, 'upload_group_file');

    await context.twoAccountTest.secondaryListener.waitForEvent(
      {
        post_type: 'notice',
        notice_type: 'group_upload',
        group_id: Number(context.testGroupId),
      },
      (event: any) => event.file?.name === fileName,
      30000,
    );
  }, 60000);

  it('group_essence — primary 设/取消精华，secondary 收到 essence', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');

    // 先在群里发条消息
    const sendResp = await primary.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: [{ type: OB11MessageDataType.Text, data: { text: `essence test ${Date.now()}` } }] as OB11MessageData[],
    });
    Assertions.assertSuccess(sendResp, 'send_group_msg');
    const messageId = sendResp.data.message_id;
    await new Promise(r => setTimeout(r, 1500));

    await primary.call(ActionName.GoCQHTTP_SetEssenceMsg, { message_id: messageId });
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'essence',
      sub_type: 'add',
      group_id: Number(context.testGroupId),
    }, undefined, 15000);

    await primary.call(ActionName.GoCQHTTP_DeleteEssenceMsg, { message_id: messageId });
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'essence',
      sub_type: 'delete',
      group_id: Number(context.testGroupId),
    }, undefined, 15000);
  }, 90000);

  it('group_msg_emoji_like — primary 表情回应群消息，secondary 收到 emoji_like 通知', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');

    const sendResp = await primary.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: [{ type: OB11MessageDataType.Text, data: { text: `emoji like test ${Date.now()}` } }] as OB11MessageData[],
    });
    Assertions.assertSuccess(sendResp, 'send_group_msg');
    const messageId = sendResp.data.message_id;
    await new Promise(r => setTimeout(r, 1500));

    await primary.call(ActionName.SetMsgEmojiLike, {
      message_id: messageId,
      emoji_id: 76, // 赞
    });
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'group_msg_emoji_like',
      group_id: Number(context.testGroupId),
    }, undefined, 15000);
  }, 60000);

  it('group_title — primary（群主）给 secondary 设/清除群头衔，secondary 收到 notify.title', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');
    const title = `t${Date.now() % 100000}`; // 群头衔最多 6 字符

    await primary.call(ActionName.GoCQHTTP_SetGroupSpecialTitle, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      special_title: title,
    });
    await context.twoAccountTest.secondaryListener.waitForEvent(
      {
        post_type: 'notice',
        notice_type: 'notify',
        sub_type: 'title',
        group_id: Number(context.testGroupId),
        user_id: Number(context.secondaryUserId),
      },
      (event: any) => event.title === title,
      15000,
    );

    // 还原：清空头衔
    await primary.call(ActionName.GoCQHTTP_SetGroupSpecialTitle, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      special_title: '',
    });
  }, 60000);
});

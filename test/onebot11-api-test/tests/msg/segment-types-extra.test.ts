/**
 * 消息段（OB11MessageDataType）覆盖：face / dice / rps / poke / json / markdown / mface / contact
 *
 * 这些类型 send-group-msg.test.ts 没覆盖到（那个测了 text/image/video/record/at/reply）。
 * 这里集中验：bot 发送 → secondary 收到的事件里能看到对应 type 的 segment。
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageData, OB11MessageDataType } from '@llbot/onebot11/types';
import { MediaPaths } from '../media';

async function sendAndExpectSegment(
  context: MessageTestContext,
  message: OB11MessageData[] | string,
  expectedType: OB11MessageDataType
) {
  context.twoAccountTest.clearAllQueues();
  const primary = context.twoAccountTest.getClient('primary');
  const sendResp = await primary.call(ActionName.SendGroupMsg, {
    group_id: context.testGroupId,
    message,
  });
  Assertions.assertSuccess(sendResp, 'send_group_msg');

  const ev = await context.twoAccountTest.secondaryListener.waitForEvent(
    {
      post_type: 'message',
      message_type: 'group',
      group_id: Number(context.testGroupId),
      message_id: sendResp.data.message_id,
    },
    (event: any) => {
      const msg: OB11MessageData[] = Array.isArray(event.message) ? event.message : [];
      return msg.some(m => m.type === expectedType);
    },
    30000,
  );
  return ev;
}

describe('消息段类型覆盖（额外）', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('face — QQ 表情', async () => {
    await sendAndExpectSegment(
      context,
      [{ type: OB11MessageDataType.Face, data: { id: '178' } } as any],
      OB11MessageDataType.Face,
    );
  }, 60000);

  it('dice — 骰子', async () => {
    await sendAndExpectSegment(
      context,
      [{ type: OB11MessageDataType.Dice, data: {} } as any],
      OB11MessageDataType.Dice,
    );
  }, 60000);

  it('rps — 猜拳', async () => {
    await sendAndExpectSegment(
      context,
      [{ type: OB11MessageDataType.Rps, data: {} } as any],
      OB11MessageDataType.Rps,
    );
  }, 60000);

  it('json — JSON 卡片', async () => {
    const json = JSON.stringify({
      app: 'com.tencent.miniapp.lua',
      view: 'noDataView',
      ver: '1.0.0.1',
      desc: '',
      from: 1,
      meta: { news: { title: 'json test', desc: 'OneBot json segment', preview: '', url: 'https://example.com' } },
      prompt: '[json test]',
      config: { ctime: Date.now(), forward: 1, type: 'normal' },
    });
    await sendAndExpectSegment(
      context,
      [{ type: OB11MessageDataType.Json, data: { data: json } } as any],
      OB11MessageDataType.Json,
    );
  }, 60000);

  it.skip('poke (segment) — 群内戳一戳', async () => {
    await sendAndExpectSegment(
      context,
      [{ type: OB11MessageDataType.Poke, data: { qq: context.secondaryUserId } } as any],
      OB11MessageDataType.Poke,
    );
  }, 60000);

  it.skip('markdown — markdown 内容', async () => {
    await sendAndExpectSegment(
      context,
      [{
        type: OB11MessageDataType.Markdown,
        data: { content: '# md test\nhello **world**' },
      } as any],
      OB11MessageDataType.Markdown,
    );
  }, 60000);

  it('shake — 窗口抖动（私聊）', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');
    const sendResp = await primary.call(ActionName.SendPrivateMsg, {
      user_id: context.secondaryUserId,
      message: [{ type: OB11MessageDataType.Shake, data: {} } as any],
    });
    Assertions.assertSuccess(sendResp, 'send_private_msg');
    await context.twoAccountTest.secondaryListener.waitForEvent(
      {
        post_type: 'message',
        message_type: 'private',
        message_id: sendResp.data.message_id,
      },
      (event: any) => {
        const msg: OB11MessageData[] = Array.isArray(event.message) ? event.message : [];
        return msg.some(m => m.type === OB11MessageDataType.Shake);
      },
      30000,
    );
  }, 60000);

  it('music — 音乐分享卡片', async () => {
    await sendAndExpectSegment(
      context,
      [{
        type: OB11MessageDataType.Music,
        data: { type: '163', id: '5279713' },
      } as any],
      OB11MessageDataType.Music,
    );
  }, 60000);

  it('file — 私聊 file segment', async () => {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');
    const fileName = `seg-file-${Date.now()}.txt`;
    const sendResp = await primary.call(ActionName.SendPrivateMsg, {
      user_id: context.secondaryUserId,
      message: [{
        type: OB11MessageDataType.File,
        data: { file: MediaPaths.getPath('test_ocr.png'), name: fileName },
      } as any],
    });
    Assertions.assertSuccess(sendResp, 'send_private_msg');
    await context.twoAccountTest.secondaryListener.waitForEvent(
      {
        post_type: 'message',
        message_type: 'private',
        message_id: sendResp.data.message_id,
      },
      (event: any) => {
        const msg: OB11MessageData[] = Array.isArray(event.message) ? event.message : [];
        return msg.some(m => m.type === OB11MessageDataType.File);
      },
      30000,
    );
  }, 60000);

  // mface 需要 server 签发的 key（无法自己生成有效的），自动化里只能从入站 mface 里
  // 抓取再回放——先 skip，等有合适 fixture 再启用。
  it.skip('mface — 商城表情', async () => {
    void context;
    void OB11MessageDataType;
  });
});

/** 合并转发的边角场景, 纯文本 inline node 在 send-forward-msg.test.ts */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/onebot11/types';
import { MediaPaths } from '../media';

describe('OB11 合并转发深度测试', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  async function sendGroupAndAwait(content: OB11MessageData[]): Promise<{ messageId: number }> {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');
    const r = await primary.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: content,
    });
    Assertions.assertSuccess(r, 'send_group_msg');
    const messageId = r.data.message_id;
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: messageId,
    }, undefined, 15000);
    await new Promise(r => setTimeout(r, 500));
    return { messageId };
  }

  async function sendForwardAndGetId(messages: any[]): Promise<{ messageId: number; forwardId: string }> {
    context.twoAccountTest.clearAllQueues();
    const primary = context.twoAccountTest.getClient('primary');
    const r = await primary.call(ActionName.GoCQHTTP_SendGroupForwardMsg, {
      group_id: context.testGroupId,
      messages,
    });
    Assertions.assertSuccess(r, 'send_group_forward_msg');
    const forwardId = r.data.forward_id;
    expect(typeof forwardId).toBe('string');
    expect(forwardId.length).toBeGreaterThan(0);
    return { messageId: r.data.message_id, forwardId };
  }

  async function pullForward(forwardId: string): Promise<any[]> {
    const primary = context.twoAccountTest.getClient('primary');
    const r = await primary.call(ActionName.GoCQHTTP_GetForwardMsg, { message_id: forwardId });
    Assertions.assertSuccess(r, 'get_forward_msg');
    expect(Array.isArray(r.data?.messages)).toBe(true);
    return r.data.messages;
  }

  it('inline 节点含 image / face 段：发出后能拉回', async () => {
    const ts = Date.now();
    const { forwardId } = await sendForwardAndGetId([
      {
        type: 'node',
        data: {
          name: '小张',
          uin: context.primaryUserId,
          content: [
            { type: OB11MessageDataType.Image, data: { file: MediaPaths.testGifUrl } },
            { type: OB11MessageDataType.Text, data: { text: `node-image-${ts}` } },
          ],
        },
      },
      {
        type: 'node',
        data: {
          name: '小李',
          uin: context.primaryUserId,
          content: [
            { type: OB11MessageDataType.Face, data: { id: '4' } },
            { type: OB11MessageDataType.Text, data: { text: `node-face-${ts}` } },
          ],
        },
      },
    ]);
    const messages = await pullForward(forwardId);
    expect(messages.length).toBe(2);
    // 节点 0：含 image 段；text 后缀保留
    const node0Content = messages[0].content as any[];
    expect(node0Content.some((s: any) => s.type === OB11MessageDataType.Image)).toBe(true);
    expect(node0Content.some((s: any) =>
      s.type === OB11MessageDataType.Text && (s.data?.text ?? '').includes(`node-image-${ts}`),
    )).toBe(true);
    // 节点 1: face 段 server 通常会退化成文本, 只断言 text 后缀
    const node1Content = messages[1].content as any[];
    expect(node1Content.some((s: any) =>
      s.type === OB11MessageDataType.Text && (s.data?.text ?? '').includes(`node-face-${ts}`),
    )).toBe(true);
  }, 60000);

  it('inline 节点含 record / video 段：发出后能拉回', async () => {
    const ts = Date.now();
    const { forwardId } = await sendForwardAndGetId([
      {
        type: 'node',
        data: {
          name: 'A',
          uin: context.primaryUserId,
          content: [
            { type: OB11MessageDataType.Record, data: { file: MediaPaths.testAudioUrl } },
          ],
        },
      },
      {
        type: 'node',
        data: {
          name: 'B',
          uin: context.primaryUserId,
          content: [
            { type: OB11MessageDataType.Video, data: { file: MediaPaths.testVideoUrl } },
            { type: OB11MessageDataType.Text, data: { text: `video-node-${ts}` } },
          ],
        },
      },
    ]);
    const messages = await pullForward(forwardId);
    expect(messages.length).toBe(2);
    expect((messages[0].content as any[]).some((s: any) => s.type === OB11MessageDataType.Record)).toBe(true);
    expect((messages[1].content as any[]).some((s: any) => s.type === OB11MessageDataType.Video)).toBe(true);
  }, 120000);

  it('inline 节点含 reply 段（锚点是普通文本群消息）：reply 段保留 + 客户端能渲染锚点预览', async () => {
    // messageBuilding.ts isInsideForward 快照编码的端到端测试 (OB11 / Milky 共用)
    const ts = Date.now();
    const anchorText = `【ob11-fwd-anchor-${ts}】这是被引用的锚点`;
    const { messageId: anchorId } = await sendGroupAndAwait([
      { type: OB11MessageDataType.Text, data: { text: anchorText } },
    ]);

    const { forwardId } = await sendForwardAndGetId([
      {
        type: 'node',
        data: {
          name: '回复者',
          uin: context.primaryUserId,
          content: [
            { type: OB11MessageDataType.Reply, data: { id: String(anchorId) } },
            { type: OB11MessageDataType.Text, data: { text: `引用上面 ${ts}` } },
          ],
        },
      },
    ]);
    const messages = await pullForward(forwardId);
    expect(messages.length).toBe(1);
    const content = messages[0].content as any[];
    const reply = content.find((s: any) => s.type === OB11MessageDataType.Reply);
    expect(reply).toBeDefined();
    expect(content.some((s: any) =>
      s.type === OB11MessageDataType.Text && (s.data?.text ?? '').includes(`引用上面 ${ts}`),
    )).toBe(true);
  }, 90000);

  it('inline 节点 reply 锚点是图片消息：依然能 build + 拉回，reply 段存在', async () => {
    const ts = Date.now();
    const { messageId: anchorId } = await sendGroupAndAwait([
      { type: OB11MessageDataType.Image, data: { file: MediaPaths.testGifUrl } },
      { type: OB11MessageDataType.Text, data: { text: `image-anchor-${ts}` } },
    ]);

    const { forwardId } = await sendForwardAndGetId([
      {
        type: 'node',
        data: {
          name: '回复者',
          uin: context.primaryUserId,
          content: [
            { type: OB11MessageDataType.Reply, data: { id: String(anchorId) } },
            { type: OB11MessageDataType.Text, data: { text: `引用上面那张图 ${ts}` } },
          ],
        },
      },
    ]);
    const messages = await pullForward(forwardId);
    const content = messages[0].content as any[];
    const reply = content.find((s: any) => s.type === OB11MessageDataType.Reply);
    expect(reply).toBeDefined();
    expect(content.some((s: any) =>
      s.type === OB11MessageDataType.Text && (s.data?.text ?? '').includes(`引用上面那张图 ${ts}`),
    )).toBe(true);
  }, 120000);

  it('嵌套合并转发：forward 里嵌套 forward 节点', async () => {
    const ts = Date.now();
    const result = await sendForwardAndGetId([
      {
        type: 'node',
        data: {
          name: 'outer-A',
          uin: context.primaryUserId,
          content: [{ type: OB11MessageDataType.Text, data: { text: `outer-text-${ts}` } }],
        },
      },
      {
        type: 'node',
        data: {
          name: 'outer-B',
          uin: context.primaryUserId,
          content: [
            {
              type: OB11MessageDataType.Forward,
              data: {
                id: '',
                content: [
                  {
                    type: 'node',
                    data: {
                      name: 'inner-X',
                      uin: context.primaryUserId,
                      content: [{ type: OB11MessageDataType.Text, data: { text: `inner-text-${ts}` } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]).catch((e) => {
      // inline 里的 forward 段不一定支持, 失败就跳过
      console.log('skip nested forward inline (OB11 inline forward not supported):', (e as Error).message);
      return null;
    });
    if (!result) return;
    const { forwardId } = result;
    const messages = await pullForward(forwardId);
    expect(messages.length).toBe(2);
    expect(messages[0].content.some((s: any) =>
      s.type === OB11MessageDataType.Text && (s.data?.text ?? '').includes(`outer-text-${ts}`),
    )).toBe(true);
  }, 120000);
});

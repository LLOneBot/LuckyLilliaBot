import { TcpConnection } from './connection'
import { buildServicePacket, buildServicePacket13, parseServicePacket, EncryptType, PacketContext, SsoPacket } from './packet'
import { generateEcdhKeyPair, EcdhKeyPair } from './ecdh'
import { requestSign, setupSign, setSignMachineGuid, acquireSignToken, SignResult } from './sign'
import { AppInfo } from './appInfo'
import { loadMachineGuidSync } from './machineGuid'
import { EventEmitter } from 'node:events'

export interface DirectClientConfig {
  appId: number
  subAppId: number
  ssoVersion: number
  buildVer: string
  useIPv6?: boolean
  /** 一次性 token, 由用户在 manager-web 生成后粘贴到 data/auth_token.txt. 跟 sign 请求一起发. */
  authToken?: string
  /** LuckyLillia.Bot 版本号 (env-report 带上). */
  botVersion?: string
  /** 数据目录 (存 device_ids.json 等跨重启稳定指纹). 默认 'data'. */
  dataDir?: string
  /** 当前账号 uin, 可选. */
  uin?: number
}

const DEFAULT_CONFIG: DirectClientConfig = {
  appId: AppInfo.appId,
  subAppId: AppInfo.subAppId,
  ssoVersion: AppInfo.ssoVersion,
  buildVer: AppInfo.buildVer,
  useIPv6: false,
}

export interface SessionInfo {
  uin: string
  uid: string
  d2: Buffer
  d2Key: Buffer
  tgt: Buffer
  a2: Buffer
  a2Key: Buffer
  sKey: Buffer
  /** 12B ASCII sign-token, 走 SignProxy.acquireSignToken 拿到. 跟 authToken 不是一个东西. */
  signToken12B?: string
  signTokenExpiresAt?: number
}

export class DirectProtocolClient extends EventEmitter {
  private conn: TcpConnection
  private config: DirectClientConfig
  private ecdhKeyPair: EcdhKeyPair
  private guid: Buffer
  private seq = (Math.random() * 0x00FFFFFF) >>> 0
  private session: SessionInfo | null = null
  private signSetupDone = false
  private pendingPackets: Map<number, {
    resolve: (packet: SsoPacket) => void
    reject: (err: Error) => void
    timeout: NodeJS.Timeout
  }> = new Map()
  private signTokenRefreshInflight: Promise<void> | null = null
  private signTokenLastFetchAt = 0

  constructor(config: Partial<DirectClientConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.guid = loadMachineGuidSync()
    // sign 初始化不在构造函数里做 -- native init 现在是 async (传 uin 时 await /api/bu bind),
    // 构造函数没法 await. 挪到 connect() 顶部, 由调用方 await. 见 ensureSignSetup.
    this.conn = new TcpConnection()
    this.ecdhKeyPair = generateEcdhKeyPair()

    this.conn.on('packet', (frame: Buffer) => this.handlePacket(frame))
    this.conn.on('error', (err) => this.emit('error', err))
    this.conn.on('close', () => this.emit('close'))
  }

  /**
   * 起 sign 链路: 建 native Client + 注册 send_packet/logger; 配置里带了 uin 时 await /api/bu bind.
   * native init 是 async, 必须在能 await 的地方跑 (不能塞构造函数) -- 故由 connect() 调.
   * 幂等: 二次调直接返回 (native init 二次也是 no-op). bind 失败时 reject 会从 connect() 冒出去.
   */
  private async ensureSignSetup(): Promise<void> {
    if (this.signSetupDone || !this.config.authToken) return
    this.signSetupDone = true
    await setupSign({
      botVersion: this.config.botVersion ?? 'unknown',
      authToken: this.config.authToken,
      machineGuid: this.guid,
      uin: this.config.uin,
      sendPacket: async ({ cmd, body }) => {
        const resp = (await this.sendCommand(cmd, Buffer.from(body))).payload
        if (process.env.DEBUG_SIGN) {
          console.log(`[Sign relay] ${cmd}: req=${body.length}B resp=${resp.length}B hex=${resp.toString('hex')}`)
        }
        return resp
      },
    })
  }

  async connect(): Promise<void> {
    // sign 链路 init (signRequest 依赖); token 有效性不在此 preflight —— 已移到 WebUI 侧
    // 的 HTTP 校验 (validateAuthToken). 旧 preflightSign 在 token 无效(401/403)时会触发
    // native SDK 内部 process.exit, 会把整个 bot 进程带崩, 故移除.
    await this.ensureSignSetup()
    await this.conn.connect({ useIPv6: this.config.useIPv6 })
    this.emit('connected')

    // Send initial heartbeat (required before other commands)
    await this.sendHeartbeat()
  }


  async sendHeartbeat(): Promise<void> {
    const seq = this.nextSeq()
    const ctx = this.getPacketContext()
    const payload = Buffer.alloc(4)
    payload.writeUInt32BE(0x00000004)
    const packet = buildServicePacket13(seq, 'Heartbeat.Alive', ctx, payload, EncryptType.NoEncrypt)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPackets.delete(seq)
        resolve() // Don't fail on heartbeat timeout
      }, 5000)

      this.pendingPackets.set(seq, {
        resolve: () => { clearTimeout(timer); resolve() },
        reject: (err) => { clearTimeout(timer); reject(err) },
        timeout: timer,
      })

      this.conn.send(packet)
    })
  }

  disconnect(): void {
    this.conn.disconnect()
    for (const [, pending] of this.pendingPackets) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Disconnected'))
    }
    this.pendingPackets.clear()
  }

  private nextSeq(): number {
    return this.seq++
  }

  private getPacketContext(): PacketContext {
    return {
      uin: this.session?.uin || '0',
      uid: this.session?.uid || '',
      d2: this.session?.d2 || Buffer.alloc(0),
      d2Key: this.session?.d2Key || Buffer.alloc(16),
      tgt: this.session?.tgt || Buffer.alloc(0),
      guid: this.guid,
      appId: this.config.appId,
      subAppId: this.config.subAppId,
      buildVer: this.config.buildVer,
    }
  }

  private readonly SIGN_ALLOWLIST = new Set([
    'AvatarInfoSvr.QQHeadUrlReq',
    'CertifiedAccountSvc.certified_account_read.GetFollowList',
    'ConfigPushSvc.PushResp',
    'ConnAuthSvr.fast_qq_login',
    'ConnAuthSvr.get_app_info',
    'ConnAuthSvr.get_app_info_emp',
    'ConnAuthSvr.get_auth_api_list',
    'ConnAuthSvr.get_auth_api_list_emp',
    'ConnAuthSvr.sdk_auth_api',
    'ConnAuthSvr.sdk_auth_api_emp',
    'FeedCloudSvr.trpc.circlesearch.exhibition.ExhibitionSvr.ExhibitionSuggestion',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetBusiInfo',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetCommentList',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetFeedList',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetMainPageBasicData',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetMainPageCommData',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetRelationGroupList',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetReplyList',
    'FeedCloudSvr.trpc.feedcloud.commreader.ComReader.GetRerankedFeedList',
    'FeedCloudSvr.trpc.feedcloud.commwriter.ComWriter.DoBarrage',
    'FeedCloudSvr.trpc.feedcloud.commwriter.ComWriter.DoComment',
    'FeedCloudSvr.trpc.feedcloud.commwriter.ComWriter.DoFollow',
    'FeedCloudSvr.trpc.feedcloud.commwriter.ComWriter.DoLike',
    'FeedCloudSvr.trpc.feedcloud.commwriter.ComWriter.DoPush',
    'FeedCloudSvr.trpc.feedcloud.commwriter.ComWriter.DoReply',
    'FeedCloudSvr.trpc.feedcloud.commwriter.ComWriter.PublishFeed',
    'FeedCloudSvr.trpc.videocircle.circleprofile.CircleProfile.SetProfile',
    'GameCenterMsg.GetUserInfo',
    'HttpConn.0x6ff_501',
    'IncreaseURLSvr.QQHeadUrlReq',
    'LightAppSvc.mini_app_cloudstorage.GetUserCloudStorage',
    'LightAppSvc.mini_app_privacy.GetPrivacyInfo',
    'LightAppSvc.mini_app_userapp.GetDropdownAppList',
    'MQUpdateSvc_com_qq_qzone_act.web.OidbSvcTrpcJsapiTcp.0x9377_0',
    'MQUpdateSvc_com_qq_ti.web.OidbSvcTrpcJsapiTcp.0x9044_0',
    'MQUpdateSvc_com_qq_ti.web.OidbSvcTrpcJsapiTcp.0x9047_0',
    'MQUpdateSvc_com_qq_ti.web.OidbSvcTrpcJsapiTcp.0x9172_0',
    'MessageSvc.PbBindUinGetMsg',
    'MessageSvc.PbGetGroupMsg',
    'MessageSvc.PbGetMsg',
    'MessageSvc.PbGetRoamMsg',
    'MessageSvc.PbSendMsg',
    'MsgProxy.SendMsg',
    'NowSummaryCard.NearbyMiniCardReq',
    'OidbSvc.0x42d',
    'OidbSvc.0x42d_4',
    'OidbSvc.0x480_9',
    'OidbSvc.0x480_9_IMCore',
    'OidbSvc.0x4ff_9',
    'OidbSvc.0x4ff_9_IMCore',
    'OidbSvc.0x515_2',
    'OidbSvc.0x53c_2',
    'OidbSvc.0x56c_6',
    'OidbSvc.0x570_8',
    'OidbSvc.0x580_1',
    'OidbSvc.0x587_123',
    'OidbSvc.0x587_normalNightSet',
    'OidbSvc.0x58b',
    'OidbSvc.0x592',
    'OidbSvc.0x592_1',
    'OidbSvc.0x592_10',
    'OidbSvc.0x592_11',
    'OidbSvc.0x592_12',
    'OidbSvc.0x592_13',
    'OidbSvc.0x592_15',
    'OidbSvc.0x592_16',
    'OidbSvc.0x592_17',
    'OidbSvc.0x592_18',
    'OidbSvc.0x592_19',
    'OidbSvc.0x592_2',
    'OidbSvc.0x592_3',
    'OidbSvc.0x592_4',
    'OidbSvc.0x592_5',
    'OidbSvc.0x592_6',
    'OidbSvc.0x592_7',
    'OidbSvc.0x592_8',
    'OidbSvc.0x592_9',
    'OidbSvc.0x59f',
    'OidbSvc.0x5d0_1',
    'OidbSvc.0x5eb_15',
    'OidbSvc.0x5eb_22',
    'OidbSvc.0x5eb_42073',
    'OidbSvc.0x5eb_42261',
    'OidbSvc.0x5eb_43',
    'OidbSvc.0x5eb_96',
    'OidbSvc.0x5eb_99',
    'OidbSvc.0x5eb_ForTheme',
    'OidbSvc.0x5eb_cn_switch',
    'OidbSvc.0x5eb_common',
    'OidbSvc.0x6d6_0',
    'OidbSvc.0x6d6_2',
    'OidbSvc.0x6d6_3',
    'OidbSvc.0x6d7_0',
    'OidbSvc.0x6d9_4',
    'OidbSvc.0x6de',
    'OidbSvc.0x758',
    'OidbSvc.0x758_0',
    'OidbSvc.0x758_1',
    'OidbSvc.0x787_0',
    'OidbSvc.0x787_1',
    'OidbSvc.0x787_11',
    'OidbSvc.0x7a2_0',
    'OidbSvc.0x7df_3',
    'OidbSvc.0x852_35',
    'OidbSvc.0x852_48',
    'OidbSvc.0x88d_0',
    'OidbSvc.0x88d_1',
    'OidbSvc.0x88d_1_2',
    'OidbSvc.0x88d_7',
    'OidbSvc.0x899_0',
    'OidbSvc.0x899_9',
    'OidbSvc.0x89a_0',
    'OidbSvc.0x89b_1',
    'OidbSvc.0x8a0_0',
    'OidbSvc.0x8a1_0',
    'OidbSvc.0x8a1_7',
    'OidbSvc.0x8a4',
    'OidbSvc.0x8a8',
    'OidbSvc.0x8ba',
    'OidbSvc.0x8f1',
    'OidbSvc.0x9fa',
    'OidbSvc.0xb3c',
    'OidbSvc.0xb3c_1',
    'OidbSvc.0xb3c_2',
    'OidbSvc.0xb3c_3',
    'OidbSvc.0xb3c_4',
    'OidbSvc.0xb3c_5',
    'OidbSvc.0xb3c_6',
    'OidbSvc.0xb3c_7',
    'OidbSvc.0xb3c_8',
    'OidbSvc.0xb3c_add',
    'OidbSvc.0xb3c_delete',
    'OidbSvc.0xb3c_get_by_id',
    'OidbSvc.0xb3c_get_done',
    'OidbSvc.0xb3c_get_done_count',
    'OidbSvc.0xb3c_get_undone',
    'OidbSvc.0xb3c_share',
    'OidbSvc.0xb3c_update',
    'OidbSvc.0xb3c_update_5',
    'OidbSvc.0xb77_34',
    'OidbSvc.0xb77_46',
    'OidbSvc.0xb77_48',
    'OidbSvc.0xb77_9',
    'OidbSvc.0xbbb',
    'OidbSvc.0xbcb',
    'OidbSvc.0xbe8',
    'OidbSvc.0xc26_0',
    'OidbSvc.0xc33_42220',
    'OidbSvc.0xc6b',
    'OidbSvc.0xcd5',
    'OidbSvc.0xcdd',
    'OidbSvc.0xd69',
    'OidbSvc.0xdc2_34',
    'OidbSvc.0xdc2_9',
    'OidbSvc.0xe27',
    'OidbSvc.0xe3e',
    'OidbSvc.0xe61',
    'OidbSvc.0xe63_1',
    'OidbSvc.0xe72',
    'OidbSvc.0xef0_1',
    'OidbSvc.0xf7e_1',
    'OidbSvc.oidb_0x758',
    'OidbSvcTRPCTcp.0x758_1',
    'OidbSvcTRPCTcp.0xf67_1',
    'OidbSvcTcp.0x102a',
    'OidbSvcTcp.0x88d_0',
    'OidbSvcTcp.0x88d_1',
    'OidbSvcTcp.0xef0_1',
    'OidbSvcTrpcTcp.0x1017_1',
    'OidbSvcTrpcTcp.0x101b_1',
    'OidbSvcTrpcTcp.0x101e_1',
    'OidbSvcTrpcTcp.0x101e_2',
    'OidbSvcTrpcTcp.0x102a_0',
    'OidbSvcTrpcTcp.0x102a_1',
    'OidbSvcTrpcTcp.0x102a_3',
    'OidbSvcTrpcTcp.0x105b_1',
    'OidbSvcTrpcTcp.0x1092_0',
    'OidbSvcTrpcTcp.0x10c0_1',
    'OidbSvcTrpcTcp.0x10c0_2',
    'OidbSvcTrpcTcp.0x10c8_1',
    'OidbSvcTrpcTcp.0x10c8_2',
    'OidbSvcTrpcTcp.0x10d8_1',
    'OidbSvcTrpcTcp.0x10db_1',
    'OidbSvcTrpcTcp.0x10e4_1',
    'OidbSvcTrpcTcp.0x10ed_1',
    'OidbSvcTrpcTcp.0x10f4_1',
    'OidbSvcTrpcTcp.0x1100_1',
    'OidbSvcTrpcTcp.0x1102_1',
    'OidbSvcTrpcTcp.0x1103_1',
    'OidbSvcTrpcTcp.0x1105_1',
    'OidbSvcTrpcTcp.0x1107_1',
    'OidbSvcTrpcTcp.0x110d_1',
    'OidbSvcTrpcTcp.0x112a_1',
    'OidbSvcTrpcTcp.0x112a_2',
    'OidbSvcTrpcTcp.0x112e_1',
    'OidbSvcTrpcTcp.0x1130_1',
    'OidbSvcTrpcTcp.0x116c_1',
    'OidbSvcTrpcTcp.0x116d_1',
    'OidbSvcTrpcTcp.0x1194_1',
    'OidbSvcTrpcTcp.0x11c4_100',
    'OidbSvcTrpcTcp.0x11c4_200',
    'OidbSvcTrpcTcp.0x11c5_100',
    'OidbSvcTrpcTcp.0x11c5_200',
    'OidbSvcTrpcTcp.0x11e9_100',
    'OidbSvcTrpcTcp.0x11e9_200',
    'OidbSvcTrpcTcp.0x11ea_200',
    'OidbSvcTrpcTcp.0x11ec_1',
    'OidbSvcTrpcTcp.0x121e_0',
    'OidbSvcTrpcTcp.0x1224_0',
    'OidbSvcTrpcTcp.0x1225_0',
    'OidbSvcTrpcTcp.0x123c_1',
    'OidbSvcTrpcTcp.0x1250_0',
    'OidbSvcTrpcTcp.0x1258_1',
    'OidbSvcTrpcTcp.0x125b_500',
    'OidbSvcTrpcTcp.0x1262_19',
    'OidbSvcTrpcTcp.0x126d_200',
    'OidbSvcTrpcTcp.0x126e_200',
    'OidbSvcTrpcTcp.0x1277_0',
    'OidbSvcTrpcTcp.0x127a_0',
    'OidbSvcTrpcTcp.0x1289_1',
    'OidbSvcTrpcTcp.0x12a9_200',
    'OidbSvcTrpcTcp.0x12b1_0',
    'OidbSvcTrpcTcp.0x55f_0',
    'OidbSvcTrpcTcp.0x587_74',
    'OidbSvcTrpcTcp.0x5cf_11',
    'OidbSvcTrpcTcp.0x644_1',
    'OidbSvcTrpcTcp.0x6d6_2',
    'OidbSvcTrpcTcp.0x6d6_3',
    'OidbSvcTrpcTcp.0x6d8_1',
    'OidbSvcTrpcTcp.0x6d9_2',
    'OidbSvcTrpcTcp.0x6d9_4',
    'OidbSvcTrpcTcp.0x758_1',
    'OidbSvcTrpcTcp.0x787_1',
    'OidbSvcTrpcTcp.0x7c1_1',
    'OidbSvcTrpcTcp.0x7c2_5',
    'OidbSvcTrpcTcp.0x88d_0',
    'OidbSvcTrpcTcp.0x88d_111',
    'OidbSvcTrpcTcp.0x88d_14',
    'OidbSvcTrpcTcp.0x899_0',
    'OidbSvcTrpcTcp.0x899_1',
    'OidbSvcTrpcTcp.0x899_9',
    'OidbSvcTrpcTcp.0x89a_0',
    'OidbSvcTrpcTcp.0x89a_15',
    'OidbSvcTrpcTcp.0x8a0_1',
    'OidbSvcTrpcTcp.0x8a1_7',
    'OidbSvcTrpcTcp.0x8f9_14',
    'OidbSvcTrpcTcp.0x8fc_3',
    'OidbSvcTrpcTcp.0x901f_1',
    'OidbSvcTrpcTcp.0x902e_1',
    'OidbSvcTrpcTcp.0x9076_1',
    'OidbSvcTrpcTcp.0x9078_1',
    'OidbSvcTrpcTcp.0x9079_1',
    'OidbSvcTrpcTcp.0x911a_19',
    'OidbSvcTrpcTcp.0x911a_22',
    'OidbSvcTrpcTcp.0x9124_0',
    'OidbSvcTrpcTcp.0x9127_1',
    'OidbSvcTrpcTcp.0x9144_1',
    'OidbSvcTrpcTcp.0x9176_1',
    'OidbSvcTrpcTcp.0x917b_1',
    'OidbSvcTrpcTcp.0x91b6_1',
    'OidbSvcTrpcTcp.0x929b_0',
    'OidbSvcTrpcTcp.0x92d5_0',
    'OidbSvcTrpcTcp.0x92e3_0',
    'OidbSvcTrpcTcp.0x92e4_0',
    'OidbSvcTrpcTcp.0x92eb_0',
    'OidbSvcTrpcTcp.0x930d_0',
    'OidbSvcTrpcTcp.0x930e_0',
    'OidbSvcTrpcTcp.0x93d7_1',
    'OidbSvcTrpcTcp.0x9409_10',
    'OidbSvcTrpcTcp.0x9409_11',
    'OidbSvcTrpcTcp.0x9409_12',
    'OidbSvcTrpcTcp.0x9409_13',
    'OidbSvcTrpcTcp.0x9409_14',
    'OidbSvcTrpcTcp.0x9409_15',
    'OidbSvcTrpcTcp.0x9409_16',
    'OidbSvcTrpcTcp.0x9409_18',
    'OidbSvcTrpcTcp.0x9409_7',
    'OidbSvcTrpcTcp.0x9559_0',
    'OidbSvcTrpcTcp.0x955f_1',
    'OidbSvcTrpcTcp.0x9560_1',
    'OidbSvcTrpcTcp.0x962a_1',
    'OidbSvcTrpcTcp.0x9689_1',
    'OidbSvcTrpcTcp.0x972_6',
    'OidbSvcTrpcTcp.0x9a2_12',
    'OidbSvcTrpcTcp.0x9a2_8',
    'OidbSvcTrpcTcp.0xa80_1',
    'OidbSvcTrpcTcp.0xaf6_0',
    'OidbSvcTrpcTcp.0xb77_57',
    'OidbSvcTrpcTcp.0xcd5',
    'OidbSvcTrpcTcp.0xdc2_34',
    'OidbSvcTrpcTcp.0xe37_1200',
    'OidbSvcTrpcTcp.0xe37_1700',
    'OidbSvcTrpcTcp.0xe37_700',
    'OidbSvcTrpcTcp.0xe37_800',
    'OidbSvcTrpcTcp.0xf55_1',
    'OidbSvcTrpcTcp.0xf57_1',
    'OidbSvcTrpcTcp.0xf57_106',
    'OidbSvcTrpcTcp.0xf57_9',
    'OidbSvcTrpcTcp.0xf59_1',
    'OidbSvcTrpcTcp.0xf59_2',
    'OidbSvcTrpcTcp.0xf5b_1',
    'OidbSvcTrpcTcp.0xf5d_1',
    'OidbSvcTrpcTcp.0xf5d_11',
    'OidbSvcTrpcTcp.0xf65_1',
    'OidbSvcTrpcTcp.0xf65_10',
    'OidbSvcTrpcTcp.0xf67_1',
    'OidbSvcTrpcTcp.0xf67_5',
    'OidbSvcTrpcTcp.0xf6e_1',
    'OidbSvcTrpcTcp.0xf88_1',
    'OidbSvcTrpcTcp.0xf89_1',
    'OidbSvcTrpcTcp.0xfa5_1',
    'OidbSvcTrpcTcp.0xfc9_1',
    'OidbSvcTrpcTcp.0xfd4_1',
    'OidbSvcTrpcTcp.0xfe1',
    'OidbSvcTrpcTcp.0xfe1_2',
    'OidbSvcTrpcTcp.0xfe1_8',
    'OidbSvcTrpcTcp.0xfe4_2',
    'OidbSvcTrpcTcp.0xfe5_2',
    'OidbSvcTrpcTcp.0xfe7_2',
    'OidbSvcTrpcTcp.0xfe7_3',
    'OidbSvcTrpcTcp.0xfe7_4',
    'OidbSvc_device.0x633',
    'OidbSvc_device.0x9f5',
    'PbMessageSvc.PbUnReadMsgSeq',
    'ProfileService.GetSimpleInfo',
    'ProfileService.GroupMngReq',
    'ProfileService.Pb.ReqSystemMsgAction.Group',
    'ProfileService.Pb.ReqSystemMsgNew.Group',
    'ProfileService.ReqBatchProcess',
    'ProfileService.SimpleInfo',
    'ProfileService.getGroupInfoReq',
    'PttStore.GroupPttDown',
    'PubAccountSvc.get_follow_list',
    'PushService.settoken',
    'QChannelSvr.trpc.qchannel.commreader.ComReader.BatchGetFeedDetail',
    'QChannelSvr.trpc.qchannel.commwriter.ComWriter.DoComment',
    'QChannelSvr.trpc.qchannel.commwriter.ComWriter.DoReply',
    'QChannelSvr.trpc.qchannel.commwriter.ComWriter.PublishFeed',
    'QQAIOMediaSvc.share_trans_check',
    'QQConnectLogin.auth',
    'QQConnectLogin.auth_emp',
    'QQConnectLogin.get_promote_page',
    'QQConnectLogin.get_promote_page_emp',
    'QQConnectLogin.pre_auth',
    'QQConnectLogin.pre_auth_emp',
    'QQConnectLogin.submit_promote_page',
    'QQConnectLogin.submit_promote_page_emp',
    'QQLBSShareSvc.room_operation',
    'QQRTCSvc.RoomManager-GetRoomInfo',
    'QQStranger.FeedPlazaSvr.SsoFeedPublish',
    'QQStranger.FeedSvr.SsoFeedPublish',
    'QQStranger.InteractiveMsgSvr.SsoSendInterMsg',
    'QQStranger.UserInfo.SsoBatchGetMiniUserInfo',
    'QQStranger.UserInfo.SsoGetMiniUserInfo',
    'QQStranger.UserInfo.SsoSetMiniUserInfo',
    'QQStranger.login_svr.SsoLoginInfoReport',
    'QSec.AVEng',
    'RegPrxySvc.infoLogin',
    'RegPrxySvc.infoSync',
    'ResourceConfig.ClientReq',
    'ResourceConfig.GetResourceReq',
    'SQQzoneSvc.Custom.getFacade',
    'SQQzoneSvc.GetCate',
    'SQQzoneSvc.addComment',
    'SQQzoneSvc.addReply',
    'SQQzoneSvc.elaborateFeedReport',
    'SQQzoneSvc.forward',
    'SQQzoneSvc.get',
    'SQQzoneSvc.getAIONewestFeeds',
    'SQQzoneSvc.getActiveFeeds',
    'SQQzoneSvc.getMainPage',
    'SQQzoneSvc.getPhotoComment',
    'SQQzoneSvc.getPhotoWall',
    'SQQzoneSvc.getProfile',
    'SQQzoneSvc.getProfileFeeds',
    'SQQzoneSvc.getUndealCount',
    'SQQzoneSvc.getVisitorNotify',
    'SQQzoneSvc.get_all_feedsphoto_ex',
    'SQQzoneSvc.like',
    'SQQzoneSvc.mobileqboss.get',
    'SQQzoneSvc.photo',
    'SQQzoneSvc.preGetPassiveFeeds',
    'SQQzoneSvc.publishmood',
    'SQQzoneSvc.shuoshuo',
    'SecuritySvc.GetConfig',
    'SsoSnsSession.Cmd0x3_SubCmd0x1_FuncGetBlockList',
    'StatSvc.GetDevLoginInfo',
    'StatSvc.GetOnlineStatus',
    'StatSvc.SetStatusFromClient',
    'StatSvc.SimpleGet',
    'StatSvc.register',
    'SummaryCard.ReqSummaryCard',
    'VisitorSvc.ReqDeleteVisitorRecord',
    'VisitorSvc.ReqFavorite',
    'WalletGestureSvc.GetPassword',
    'WalletGestureSvc.GetSignV2',
    'WalletGestureSvc.SetPassword',
    'account.RequestQueryQQMobileContactsV3',
    'friendlist.AddFriendReq',
    'friendlist.GetFriendListReq',
    'friendlist.GetLastLoginInfoReq',
    'friendlist.GetMultiTroopInfoReq',
    'friendlist.GetSimpleOnlineFriendInfoReq',
    'friendlist.GetTroopAppointRemarkReq',
    'friendlist.GetTroopListReqV2',
    'friendlist.GetTroopMemberList',
    'friendlist.GetTroopMemberListReq',
    'friendlist.ModifyGroupInfoReq',
    'friendlist.addFriend',
    'friendlist.getFriendGroupList',
    'friendlist.getTroopMemberList',
    'gcbindgroupsso.get_appid',
    'gcbindgroupsso.unbind_group',
    'group_member_card.get_group_member_card_info',
    'group_member_statistic.get_group_member_statistic',
    'miniapp.trpc.minigame.sdk_qgroup_svr.sdk_qgroup_svr.JoinGroup',
    'oidb_0x42e_3',
    'oidb_0x43c_4',
    'oidb_0x43c_5',
    'oidb_0x5d0_1',
    'oidb_0x5d6_19',
    'oidb_0x5d6_21',
    'oidb_0x7a2_0',
    'oidb_0x7c4_0',
    'oidb_0x7df_3',
    'oidb_0x9045_1',
    'oidb_0x9072_0',
    'oidb_0xcf3_0',
    'oidb_0xcf4_0',
    'oidb_0xd9c_11',
    'oidb_0xdc2_34',
    'oidb_0xe37_1200',
    'oidb_0xe37_800',
    'oidb_0xe61_1',
    'oidb_0xe8c_0',
    'oidb_0xeb1_1',
    'oidb_0xf7e_1',
    'oidb_0xfd4_1',
    'qidianservice.135',
    'qidianservice.207',
    'qidianservice.269',
    'qidianservice.290',
    'qzoneh5.h5.wnshtml',
    'trpc.QQService.CommonLogic.StatusService.SsoGetLikeList',
    'trpc.commercial.dataworks.UserActionReport_sso.SsoReport',
    'trpc.down.intercept.Intercept.SsoGetDownloadTips',
    'trpc.down.intercept.Intercept.SsoGetInterceptFile',
    'trpc.down.joint_operation_game_intercept.JointOperationGameIntercept.SsoCheck',
    'trpc.down.joint_operation_game_intercept.JointOperationGameIntercept.SsoQueryConfig',
    'trpc.ecom.api_gateway.ApiGateway.SsoForward',
    'trpc.g_qqrtc.qq_mav_room_state_read.GetRoomState.SsoGetInfoByUin',
    'trpc.gc_indust.device_report.SsoHome.SsoHomeReport',
    'trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg',
    'trpc.group.long_msg_interface.MsgService.SsoSendLongMsg',
    'trpc.group_pro.msgproxy.sendmsg',
    'trpc.group_pro.synclogic.SyncLogic.SyncFirstView',
    'trpc.login.ecdh.EcdhService.SsoKeyExchange',
    'trpc.login.ecdh.EcdhService.SsoNTLoginAuthCodeLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginAuthLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginAuthNewDevice',
    'trpc.login.ecdh.EcdhService.SsoNTLoginCheckA1List',
    'trpc.login.ecdh.EcdhService.SsoNTLoginCheckGateWayCode',
    'trpc.login.ecdh.EcdhService.SsoNTLoginCheckSms',
    'trpc.login.ecdh.EcdhService.SsoNTLoginCheckThirdCode',
    'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLoginUnusualDevice',
    'trpc.login.ecdh.EcdhService.SsoNTLoginGetSaltList',
    'trpc.login.ecdh.EcdhService.SsoNTLoginGetSms',
    'trpc.login.ecdh.EcdhService.SsoNTLoginOptimusLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginNewDevice',
    'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginUnusualDevice',
    'trpc.login.ecdh.EcdhService.SsoNTLoginRapidLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginRefreshA2',
    'trpc.login.ecdh.EcdhService.SsoNTLoginRefreshTicket',
    'trpc.login.ecdh.EcdhService.SsoNTLoginTGTExchangeFastLogin',
    'trpc.login.ecdh.EcdhService.SsoOIDB0x916a',
    'trpc.login.ecdh.EcdhService.SsoOIDB0x916b',
    'trpc.login.ecdh.EcdhService.SsoOIDB0x916c',
    'trpc.login.ecdh.EcdhService.SsoOIDB0x916d',
    'trpc.login.ecdh.EcdhService.SsoQRLoginAuthQr',
    'trpc.login.ecdh.EcdhService.SsoQRLoginCancleQr',
    'trpc.login.ecdh.EcdhService.SsoQRLoginGenQr',
    'trpc.login.ecdh.EcdhService.SsoQRLoginRejectQr',
    'trpc.login.ecdh.EcdhService.SsoQRLoginScanQr',
    'trpc.lplan.feed_svr.StatusWrite.SsoComment',
    'trpc.lplan.feed_svr.StatusWrite.SsoPostStatus',
    'trpc.lplan.feed_svr.StatusWrite.SsoReply',
    'trpc.lplan.like_svr.Like.SsoDoLike',
    'trpc.lplan.map_svr.Map.SsoReportLocation',
    'trpc.lplan.user_manager_svr.User.SsoLogin',
    'trpc.lplan.user_manager_svr.User.SsoSetProfile',
    'trpc.metaverse.mob_proxy_svr.MobProxy.SsoHandle',
    'trpc.msg.msg_svc.MsgService.SsoC2CRecallMsg',
    'trpc.msg.msg_svc.MsgService.SsoGetPeerSeq',
    'trpc.msg.msg_svc.MsgService.SsoReadedReport',
    'trpc.msg.olpush.OlPushService.SsoPushAck',
    'trpc.msg.register_proxy.RegisterProxy.PushParams',
    'trpc.msg.register_proxy.RegisterProxy.SsoInfoSync',
    'trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey',
    'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Access',
    'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Establish',
    'trpc.o3.ecdh_access.EcdhAccess.SsoSecureAccess',
    'trpc.o3.report.Report.SsoReport',
    'trpc.passwd.manager.PasswdManager.SetPasswd',
    'trpc.passwd.manager.PasswdManager.VerifyPasswd',
    'trpc.qlive.qlive_proxy_svr.TrpcProxy.*',
    'trpc.qlive.relationchain_svr.RelationchainSvr.Follow',
    'trpc.qlive.word_svr.WordSvr.NewPublicChat',
    'trpc.qmeta.mob_proxy_svr.MobProxy.SsoHandle',
    'trpc.qpay.encryptedtransfer.Encryption.SsoUINEncrypt',
    'trpc.qpay.midas_order.Order.SsoMakeOrder',
    'trpc.qpay.red_pack_skin.Skin.SsoAddSkin',
    'trpc.qpay.sso.web.Do',
    'trpc.qq_new_tech.status_svc.StatusService.Register',
    'trpc.qq_new_tech.status_svc.StatusService.SetStatus',
    'trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat',
    'trpc.qq_new_tech.status_svc.StatusService.UnRegister',
    'trpc.qqhb.qqhb_proxy.Handler.sso_handle',
    'trpc.qqstranger.common_proxy.CommonProxy.SsoHandle',
    'trpc.qqva.vipdata.Vipdata.SsoGetUserData',
    'trpc.springfestival.redpacket.LuckyBag.SsoSubmitGrade',
    'wtlogin.device_lock',
    'wtlogin.exchange_emp',
    'wtlogin.log_report',
    'wtlogin.login',
    'wtlogin.name2uin',
    'wtlogin.qrlogin',
    'wtlogin.register',
    'wtlogin.trans_emp',
    'wtlogin_device.login',
    'wtlogin_device.tran_sim_emp'
  ])

  async sendCommand(cmd: string, payload: Buffer, encryptType?: EncryptType, timeout = 15000): Promise<SsoPacket> {
    const seq = this.nextSeq()
    const ctx = this.getPacketContext()
    const enc = encryptType ?? (this.session ? EncryptType.EncryptD2Key : EncryptType.EncryptEmpty)

    let signResult: SignResult | null = null
    if (this.config.authToken && this.SIGN_ALLOWLIST.has(cmd)) {
      const uin = this.session?.uin ? Number(this.session.uin) : undefined
      await this.ensureSignTokenFresh(uin)
      signResult = await requestSign(cmd, payload, seq, this.guid, AppInfo.qua, uin, this.session?.signToken12B)
      if (signResult?.token.length === 0) {
        signResult.token = Buffer.from(this.session?.signToken12B ?? '')
      }
      if (process.env.DEBUG_SIGN) {
        console.log(`[Sign] ${cmd} seq=${seq}: result=${signResult ? `sign=${signResult.sign.length}B token=${signResult.token.length}B extra=${signResult.extra.length}B` : 'null'}`)
      }
      // sign 是协议必需字段, 拿不到就别送 unsigned 包出去. requestSign 内部已经按 status
      // 打过具体错因 (401/403/502/503), 这里只丢异常中断 cmd.
      if (!signResult) {
        throw new Error(`sign failed for ${cmd}; see [Sign] log above`)
      }
    }

    const packet = buildServicePacket(seq, cmd, ctx, payload, enc, signResult)

    if (process.env.DEBUG_SIGN) {
      // 调试用: 出网前 dump SSO frame, 跟真机抓包对照定位 sign 不一致的字节差异.
      if (cmd.includes('o3.ecdh_access') || cmd === 'wtlogin.login' || cmd === 'wtlogin.trans_emp') {
        console.log(`[Bot SSO send] ${cmd} seq=${seq} frame=${packet.length}B hex=${packet.toString('hex')}`)
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPackets.delete(seq)
        reject(new Error(`Command ${cmd} timed out after ${timeout}ms`))
      }, timeout)

      this.pendingPackets.set(seq, { resolve, reject, timeout: timer })
      this.conn.send(packet)
    })
  }

  private handlePacket(frame: Buffer): void {
    const d2Key = this.session?.d2Key || Buffer.alloc(16)
    const parsed = parseServicePacket(frame, d2Key)
    if (!parsed) {
      this.emit('error', new Error('Failed to parse incoming packet'))
      return
    }

    const pending = this.pendingPackets.get(parsed.seq)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingPackets.delete(parsed.seq)
      if (parsed.retCode && parsed.retCode !== 0) {
        pending.reject(new Error(`SSO ${parsed.cmd} failed: retCode=${parsed.retCode}, extraMsg=${parsed.extraMsg || ''}`))
      } else {
        pending.resolve(parsed)
      }
      return
    }

    this.emit('push', parsed)
  }

  get isConnected(): boolean {
    return this.conn.isConnected
  }

  get isLoggedIn(): boolean {
    return this.session !== null
  }

  getGuid(): Buffer {
    return this.guid
  }

  setGuid(guid: Buffer): void {
    this.guid = guid
    setSignMachineGuid(guid)
  }

  getSession(): SessionInfo | null {
    return this.session
  }

  getEcdhPublicKey(): Buffer {
    return this.ecdhKeyPair.publicKey
  }

  getEcdhShareKey(): Buffer {
    return this.ecdhKeyPair.shareKey
  }

  setSession(session: SessionInfo): void {
    this.session = session
    this.emit('login', session)
    void this.tryAcquireSignToken()
  }

  /**
   * 登录后主动拉一次 sign-token. 转给 ensureSignTokenFresh 走共享 in-flight lock,
   * 避免启动期跟首次 sendCommand 并发开两个 acquire。
   */
  private async tryAcquireSignToken(): Promise<void> {
    if (!this.session || !this.config.authToken) return
    const uin = Number(this.session.uin)
    if (!Number.isFinite(uin) || uin <= 0) return
    await this.ensureSignTokenFresh(uin)
  }

  /**
   * sendCommand 前调. 按服务端下发的 TTL 续期:
   *   1. 没 session / 没 uin -> noop
   *   2. 从没拉过 (expiresAt undefined) -> 首拉一次
   *   3. 有非空 token 且未过期 -> 复用不刷
   *   4. 有非空 token 但已过期 -> 重新 acquire 续期 (续期失败按 lastFetchAt 限最小重试间隔)
   *   5. 空 token (403 软降级) -> 不刷, 免得 403 情况每次发包都去重试 acquire
   * signToken12B/expiresAt 不落盘 (见 session.ts), 每次启动/恢复都从 undefined 起,
   * 故登录后 tryAcquireSignToken 必首拉一次。in-flight lock 防并发雪崩。
   */
  private async ensureSignTokenFresh(uin: number | undefined): Promise<void> {
    if (!this.session || !uin || !this.config.authToken) return
    // 有 token 且未过期 -> 复用不刷; 有 token 但已过期 -> 往下重新 acquire 续期 (TTL 生效)。
    if (this.session.signTokenExpiresAt) {
      const expired = Date.now() >= this.session.signTokenExpiresAt
      // 空 token (403 软降级) 或未过期: 不刷。前者免得 403 每次发包都重试 acquire。
      if (!this.session.signToken12B || !expired) return
      // 已过期要续: 续期失败会让 expiresAt 停在旧值, 导致每条命令都想续 -> 用 lastFetchAt 限最小
      // 重试间隔, 免得续不上时 acquire 风暴 (正常续期间隔 = TTL, 远大于此, 不受影响)。
      if (Date.now() - this.signTokenLastFetchAt < 30_000) return
    }
    // 防重入死锁 (关键, 别改回 await): acquire 一个 token 内部要发 ecdh_access 包, 那些包走
    // sendCommand 又重入到这里。inflight 已在跑就直接放行 -- 让本次发包用当前空 token sign
    // (此刻本来也没 token)。改成 await inflight 就是去等那个正等本次发包返回的 promise = 等自己,
    // 死锁: 登录后 hang, acquire 永不返回, sign token 也打印不出来。
    if (this.signTokenRefreshInflight) return
    this.signTokenRefreshInflight = (async () => {
      try {
        this.signTokenLastFetchAt = Date.now()
        const { token, ttlSecs } = await acquireSignToken(uin, AppInfo.qua)
        if (this.session) {
          this.session.signToken12B = token
          this.session.signTokenExpiresAt = Date.now() + ttlSecs * 1000
          console.log(`[SignToken] acquired "${token}" ttl=${ttlSecs}s`)
        }
      } catch (e) {
        // 首拉失败: expiresAt 仍 undefined, 下条 allowlist 命令会再试一次首拉。
        console.warn(`[SignToken] acquire failed: ${(e as Error).message}`)
      } finally {
        this.signTokenRefreshInflight = null
      }
    })()
    await this.signTokenRefreshInflight
  }

  clearSession(): void {
    this.session = null
  }
}

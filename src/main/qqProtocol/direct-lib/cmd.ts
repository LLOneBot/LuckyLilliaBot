// 出站 SSO cmd 常量注册表 + per-platform 签名白名单 (单一真源)。
//
// 背景: 原来 cmd 字符串散落在各 mixin 里硬编码, "谁该签名"靠 client.ts 里一张
// 外部抄来的 532 条超集 allowlist 决定, 跟真机机制脱节 (真机 Linux
// 静态白名单只有 97 条), 导致一堆业务 cmd 被过度签名 (多一次 sign 往返 + 指纹偏离)。
//
// 这里把 cmd 收敛成带语义名的常量 (Cmd), 并把签名判定改成对齐真机的 per-platform
// 白名单 (SIGN_REQUIRED)。签名判定统一走 cmdNeedsSign()。

import type { ProtocolName } from './profiles'

// ============================================================================
// Cmd 注册表 —— 所有 Bot 会发出的出站 cmd, 按域分组。
// 命名取自各 mixin 里发送它的方法名 (PascalCase)。
// sendOidb(0xNNN, sub) 的数字调用不直接引用这里的常量 (它内部拼字符串), 但仍在此登记,
// 供 SIGN_REQUIRED 匹配 + 文档索引。
// ============================================================================
export const Cmd = {
  // ---- 扫码 / wtlogin 登录帧 ----
  Login: {
    ScanCode: 'wtlogin.trans_emp',            // fetchQrCode (watch 走 skipSign 不签)
    Login: 'wtlogin.login',                   // pollQrCode
    DeviceLogin: 'wtlogin_device.login',
    DeviceTranSimEmp: 'wtlogin_device.tran_sim_emp',
  },

  // ---- NT 登录 ECDH (trpc.login.ecdh.*) ----
  Ecdh: {
    KeyExchange: 'trpc.login.ecdh.EcdhService.SsoKeyExchange',
    NTLoginEasyLogin: 'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLogin',
    NTLoginEasyLoginUnusualDevice: 'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLoginUnusualDevice',
    NTLoginPasswordLogin: 'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLogin',
    NTLoginPasswordLoginNewDevice: 'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginNewDevice',
    NTLoginPasswordLoginUnusualDevice: 'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginUnusualDevice',
    NTLoginAuthLogin: 'trpc.login.ecdh.EcdhService.SsoNTLoginAuthLogin',
    NTLoginAuthCodeLogin: 'trpc.login.ecdh.EcdhService.SsoNTLoginAuthCodeLogin',
    NTLoginRefreshTicket: 'trpc.login.ecdh.EcdhService.SsoNTLoginRefreshTicket',
    NTLoginTGTExchangeFastLogin: 'trpc.login.ecdh.EcdhService.SsoNTLoginTGTExchangeFastLogin',
    QRLoginGenQr: 'trpc.login.ecdh.EcdhService.SsoQRLoginGenQr',
    OIDB0x916a: 'trpc.login.ecdh.EcdhService.SsoOIDB0x916a',
    OIDB0x916b: 'trpc.login.ecdh.EcdhService.SsoOIDB0x916b',
    OIDB0x916c: 'trpc.login.ecdh.EcdhService.SsoOIDB0x916c',
    OIDB0x916d: 'trpc.login.ecdh.EcdhService.SsoOIDB0x916d',
    OIDB0x9689: 'trpc.login.ecdh.EcdhService.SsoOIDB0x9689',
  },

  // ---- o3 安全通道 (ESK / SecureAccess / Report) ----
  O3: {
    EstablishShareKey: 'trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey',
    SecureAccess: 'trpc.o3.ecdh_access.EcdhAccess.SsoSecureAccess',
    SecureA2Access: 'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Access',
    SecureA2Establish: 'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Establish',
    Report: 'trpc.o3.report.Report.SsoReport',
  },

  // ---- 上线 / 保活 / 状态 ----
  Session: {
    InfoSync: 'trpc.msg.register_proxy.RegisterProxy.SsoInfoSync',
    Heartbeat: 'trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat',
    HeartbeatAlive: 'Heartbeat.Alive',        // type-13 层保活, 不过 sendCommand 签名门
    SetStatus: 'trpc.qq_new_tech.status_svc.StatusService.SetStatus',
    SyncFirstView: 'trpc.group_pro.synclogic.SyncLogic.SyncFirstView',
    PushAck: 'trpc.msg.olpush.OlPushService.SsoPushAck',
    PushParams: 'trpc.msg.register_proxy.RegisterProxy.PushParams',
  },

  // ---- 消息 收发 / 撤回 / 拉取 ----
  Message: {
    Send: 'MessageSvc.PbSendMsg',
    ProxySend: 'trpc.group_pro.msgproxy.sendmsg',
    SendLongMsg: 'trpc.group.long_msg_interface.MsgService.SsoSendLongMsg',
    RecvLongMsg: 'trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg',
    RecallC2C: 'trpc.msg.msg_svc.MsgService.SsoC2CRecallMsg',
    RecallGroup: 'trpc.msg.msg_svc.MsgService.SsoGroupRecallMsg',
    ReadedReport: 'trpc.msg.msg_svc.MsgService.SsoReadedReport',
    GetPeerSeq: 'trpc.msg.msg_svc.MsgService.SsoGetPeerSeq',
    GetGroupMsg: 'trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg',
    GetC2cMsg: 'trpc.msg.register_proxy.RegisterProxy.SsoGetC2cMsg',
    GetRoamMsg: 'trpc.msg.register_proxy.RegisterProxy.SsoGetRoamMsg',
    FetchAiCharacterList: 'OidbSvcTrpcTcp.0x929d_0',
    GetGroupGenerateAiRecord: 'OidbSvcTrpcTcp.0x929b_0',
    FetchMsgEmojiLikes: 'OidbSvcTrpcTcp.0x9083_1',
    SetInputStatus: 'OidbSvcTrpcTcp.0xcd4_1',
    PullPics: 'PicSearchSvr.PullPics',
    ListFavEmojis: 'Faceroam.OpReq',
    AddFavEmojiPrep: 'ImgStore.BDHExpressionRoam',
    TransGroupPtt: 'pttTrans.TransGroupPttReq',
    TransC2CPtt: 'pttTrans.TransC2CPttReq',
  },

  // ---- 群管理 / 群文件 / 群相册 ----
  Group: {
    // sendOidb (数字调用) —— 登记供 SIGN 匹配, 发送点保持数字不迁移
    Poke: 'OidbSvcTrpcTcp.0xed3_1',
    SetSpecialTitle: 'OidbSvcTrpcTcp.0x8fc_2',
    ClockIn: 'OidbSvcTrpcTcp.0xeb7_1',
    SetRemark: 'OidbSvcTrpcTcp.0xf16_1',
    SetPin: 'OidbSvcTrpcTcp.0x5d6_1',
    KickMember: 'OidbSvcTrpcTcp.0x8a0_1',
    MuteMember: 'OidbSvcTrpcTcp.0x1253_1',
    MuteAll: 'OidbSvcTrpcTcp.0x89a_0',
    SetName: 'OidbSvcTrpcTcp.0x89a_15',
    SetMemberCard: 'OidbSvcTrpcTcp.0x8fc_3',
    SetMemberAdmin: 'OidbSvcTrpcTcp.0x1096_1',
    Leave: 'OidbSvcTrpcTcp.0x1097_1',
    // sendPB (字面量) —— 发送点迁移引用
    GetFileUrl: 'OidbSvcTrpcTcp.0x6d6_2',
    FetchGroups: 'OidbSvcTrpcTcp.0xfe5_2',
    GetFileList: 'OidbSvcTrpcTcp.0x6d8_1',
    GetFileCount: 'OidbSvcTrpcTcp.0x6d8_2',
    GetFileSpace: 'OidbSvcTrpcTcp.0x6d8_3',
    FeedFile: 'OidbSvcTrpcTcp.0x6d9_4',
    DeleteFile: 'OidbSvcTrpcTcp.0x6d6_3',
    MoveFile: 'OidbSvcTrpcTcp.0x6d6_5',
    RenameFile: 'OidbSvcTrpcTcp.0x6d6_4',
    CreateFolder: 'OidbSvcTrpcTcp.0x6d7_0',
    DeleteFolder: 'OidbSvcTrpcTcp.0x6d7_1',
    RenameFolder: 'OidbSvcTrpcTcp.0x6d7_2',
    Fetch: 'OidbSvcTrpcTcp.0x88d_14',
    FetchExtra: 'OidbSvcTrpcTcp.0x88d_0',
    FetchMembers: 'OidbSvcTrpcTcp.0xfe7_3',
    FetchAtAllRemain: 'OidbSvcTrpcTcp.0x8a7_0',
    ForwardFile: 'OidbSvcTrpcTcp.0x6d9_2',
    CreateAlbum: 'QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.AddAlbum',
    DeleteAlbum: 'QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.DeleteAlbum',
    FetchAlbumList: 'QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.GetAlbumList',
    FetchAlbumMediaList: 'QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.GetMediaList',
  },

  // ---- 好友管理 / 好友请求 ----
  Friend: {
    // sendOidb (数字调用)
    Poke: 'OidbSvcTrpcTcp.0xed3_1',
    SetRequest: 'OidbSvcTrpcTcp.0xb5d_44',
    SetFilteredRequest: 'OidbSvcTrpcTcp.0xd72_0',
    SetRemark: 'OidbSvcTrpcTcp.0x10cc_1',
    Delete: 'OidbSvcTrpcTcp.0x126b_0',
    SetCategory: 'OidbSvcTrpcTcp.0x10eb_1',
    SetPin: 'OidbSvcTrpcTcp.0x5d6_18',
    // sendPB (字面量)
    GetPrivateFileUrl: 'OidbSvcTrpcTcp.0xe37_1200',
    Fetch: 'OidbSvcTrpcTcp.0xfd4_1',
    GetRecommendContactArk: 'OidbSvcTrpcTcp.0x12b6_0',
    FetchRequests: 'OidbSvcTrpcTcp.0x5cf_11',
    FetchFilteredRequests: 'OidbSvcTrpcTcp.0xd69_0',
    GetStatus: 'OidbSvcTrpcTcp.0x116d_1',
  },

  // ---- 用户资料 / 状态 / 点赞 ----
  User: {
    SendLike: 'OidbSvcTrpcTcp.0x7e5_104',
    ModifySelfProfile: 'OidbSvcTrpcTcp.0x112a_2',
    FetchInfoByUin: 'OidbSvcTrpcTcp.0xfe1_2',
    FetchLoginDays: 'MQUpdateSvc_com_qq_ti.web.OidbSvc.0xdef_1',
    FetchClientKey: 'OidbSvcTrpcTcp.0x102a_1',
    FetchPSkey: 'OidbSvcTrpcTcp.0x102a_0',
    FetchProfileLikes: 'OidbSvcTrpcTcp.0x7ed_13',
    FetchProfileLikeCount: 'OidbSvcTrpcTcp.0x7ed_12',
  },

  // ---- 富媒体 上传 / 下载 / highway / 闪传 ----
  Media: {
    GetRKey: 'OidbSvcTrpcTcp.0x9067_202',
    GetHighwaySession: 'HttpConn.0x6ff_501',
    GetPrivatePttUrl: 'OidbSvcTrpcTcp.0x126d_200',
    GetGroupPttUrl: 'OidbSvcTrpcTcp.0x126e_200',
    GetGroupVideoUrl: 'OidbSvcTrpcTcp.0x11ea_200',
    GetPrivateVideoUrl: 'OidbSvcTrpcTcp.0x11e9_200',
    NotifyGroupVideoUploadCompleted: 'OidbSvcTrpcTcp.0x11ea_100',
    GetC2CVideoUploadInfo: 'OidbSvcTrpcTcp.0x11e9_100',
    GetGroupFileUploadInfo: 'OidbSvcTrpcTcp.0x6d6_0',
    GetC2CFileUploadInfo: 'OidbSvcTrpcTcp.0xe37_1700',
    GetGroupImageUploadInfo: 'OidbSvcTrpcTcp.0x11c4_100',
    GetC2CImageUploadInfo: 'OidbSvcTrpcTcp.0x11c5_100',
    GetGroupPttUploadInfo: 'OidbSvcTrpcTcp.0x126e_100',
    GetC2CPttUploadInfo: 'OidbSvcTrpcTcp.0x126d_100',
    ImageOcr: 'OidbSvcTrpcTcp.0xe07_0',
    GetFlashFileSetIdByCode: 'OidbSvcTrpcTcp.0x93eb_1',
    GetFlashFileInfo: 'OidbSvcTrpcTcp.0x93d3_1',
    GetFlashFileList: 'OidbSvcTrpcTcp.0x93d4_1',
    GetFlashFileEntryFull: 'OidbSvcTrpcTcp.0x93e5_4',
    DownloadFlashFile: 'OidbSvcTrpcTcp.0x93d1_1',
    CreateFlashFileSet: 'OidbSvcTrpcTcp.0x93cf_1',
    RegisterFlashFile: 'OidbSvcTrpcTcp.0x93d0_1',
    PrepFlashFileSet: 'OidbSvcTrpcTcp.0x93db_1',
    FlashFileUploadPreflight: 'OidbSvcTrpcTcp.0x12a9_100',
    FlashFileUploadCommitReport: 'OidbSvcTrpcTcp.0x12a9_103',
    FlashFileUploadCommit: 'OidbSvcTrpcTcp.0x12a9_200',
  },

  // ---- 杂项 ----
  Misc: {
    FetchPins: 'OidbSvcTrpcTcp.0x12b3_0',
  },
} as const

// ============================================================================
// 真机签名白名单 (ground-truth)
// ============================================================================

// Linux 真机 sub_56D2D00 静态白名单 97 条 —— IDA 逆向自 wrapper.node 3.2.28-48517。
// 来源与门控机制见 LuckyLillia.Sign/docs/Linux/algorithm/QQ-3.2.28-48517.md
// ("Sign cmd 白名单" 一节)。真机发包主循环每个出站 cmd 都过 IsNeedSignCmd, 不在名单
// 里的裸发不签。
const LINUX_STATIC_SIGN: readonly string[] = [
  'ConnAuthSvr.fast_qq_login',
  'ConnAuthSvr.sdk_auth_api',
  'ConnAuthSvr.sdk_auth_api_emp',
  'MessageSvc.PbSendMsg',
  'MsgProxy.SendMsg',
  'OidbSvc.0xb77_9',
  'OidbSvc.0xcd5',
  'OidbSvc.0xdc2_34',
  'OidbSvcTrpcTcp.0x101b_1',
  'OidbSvcTrpcTcp.0x101e_1',
  'OidbSvcTrpcTcp.0x101e_2',
  'OidbSvcTrpcTcp.0x102a_0',
  'OidbSvcTrpcTcp.0x102a_1',
  'OidbSvcTrpcTcp.0x10c8_1',
  'OidbSvcTrpcTcp.0x10c8_2',
  'OidbSvcTrpcTcp.0x10db_1',
  'OidbSvcTrpcTcp.0x1100_1',
  'OidbSvcTrpcTcp.0x1102_1',
  'OidbSvcTrpcTcp.0x1103_1',
  'OidbSvcTrpcTcp.0x1105_1',
  'OidbSvcTrpcTcp.0x1107_1',
  'OidbSvcTrpcTcp.0x112a_1',
  'OidbSvcTrpcTcp.0x112a_2',
  'OidbSvcTrpcTcp.0x112e_1',
  'OidbSvcTrpcTcp.0x11ec_1',
  'OidbSvcTrpcTcp.0x587_74',
  'OidbSvcTrpcTcp.0x6d9_4',
  'OidbSvcTrpcTcp.0x758_1',
  'OidbSvcTrpcTcp.0x7c2_5',
  'OidbSvcTrpcTcp.0x88d_0',
  'OidbSvcTrpcTcp.0x88d_14',
  'OidbSvcTrpcTcp.0x89a_0',
  'OidbSvcTrpcTcp.0x89a_15',
  'OidbSvcTrpcTcp.0x8a1_7',
  'OidbSvcTrpcTcp.0x917b_1',
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
  'OidbSvcTrpcTcp.0x962a_1',
  'OidbSvcTrpcTcp.0xcd5',
  'OidbSvcTrpcTcp.0xcd5_0',
  'OidbSvcTrpcTcp.0xdc2_58',
  'OidbSvcTrpcTcp.0xdc2_59',
  'OidbSvcTrpcTcp.0xf55_1',
  'OidbSvcTrpcTcp.0xf57_1',
  'OidbSvcTrpcTcp.0xf57_106',
  'OidbSvcTrpcTcp.0xf57_9',
  'OidbSvcTrpcTcp.0xf65_1',
  'OidbSvcTrpcTcp.0xf65_10',
  'OidbSvcTrpcTcp.0xf67_1',
  'OidbSvcTrpcTcp.0xf67_5',
  'OidbSvcTrpcTcp.0xf6e_1',
  'OidbSvcTrpcTcp.0xf88_1',
  'OidbSvcTrpcTcp.0xf89_1',
  'OidbSvcTrpcTcp.0xfa5_1',
  'QQConnectLogin.auth',
  'QQConnectLogin.pre_auth',
  'trpc.ecom.api_gateway.ApiGateway.SsoForward',
  'trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg',
  'trpc.group.long_msg_interface.MsgService.SsoSendLongMsg',
  'trpc.group_pro.msgproxy.sendmsg',
  'trpc.login.ecdh.EcdhService.SsoKeyExchange',
  'trpc.login.ecdh.EcdhService.SsoNTLoginAuthCodeLogin',
  'trpc.login.ecdh.EcdhService.SsoNTLoginAuthLogin',
  'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLogin',
  'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLoginUnusualDevice',
  'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLogin',
  'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginNewDevice',
  'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginUnusualDevice',
  'trpc.login.ecdh.EcdhService.SsoNTLoginRefreshTicket',
  'trpc.login.ecdh.EcdhService.SsoNTLoginTGTExchangeFastLogin',
  'trpc.login.ecdh.EcdhService.SsoOIDB0x916a',
  'trpc.login.ecdh.EcdhService.SsoOIDB0x916b',
  'trpc.login.ecdh.EcdhService.SsoOIDB0x916c',
  'trpc.login.ecdh.EcdhService.SsoOIDB0x916d',
  'trpc.login.ecdh.EcdhService.SsoOIDB0x9689',
  'trpc.login.ecdh.EcdhService.SsoQRLoginGenQr',
  'trpc.msg.msg_svc.MsgService.SsoC2CRecallMsg',
  'trpc.msg.msg_svc.MsgService.SsoReadedReport',
  'trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey',
  'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Access',
  'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Establish',
  'trpc.o3.ecdh_access.EcdhAccess.SsoSecureAccess',
  'trpc.o3.report.Report.SsoReport',
  'trpc.passwd.manager.PasswdManager.SetPasswd',
  'trpc.passwd.manager.PasswdManager.VerifyPasswd',
  'trpc.qqhb.qqhb_proxy.Handler.sso_handle',
  'wtlogin.login',
  'wtlogin.trans_emp',
  'wtlogin_device.login',
  'wtlogin_device.tran_sim_emp',
  'OidbSvcTcp.0x102a',
]

// per-platform 签名白名单。三端 NT (Linux 3.2.28 / macOS 7.0.0 / Windows 9.9.33) 的本地静态 sign
// 白名单 IDA 实证**完全一致 = LINUX_STATIC_SIGN 的 99 条**。
//
// 订正 (2026-09-25): 早前把 Linux 记成 97 是提取 bug —— sub_56D2D00 里 wtlogin.trans_emp /
// OidbSvcTcp.0x102a 的 libc++ SSO 长度前缀恰为 0x22 (=17<<1='"'), 在反编译 strcpy 字面量里
// 写作转义 \", 被旧正则漏掉。补回后 Linux 也是 99, 与 mac/win 逐字节同。故 trans_emp 是**静态**
// 成员 (走本地分支签名, 删 MMKV 照签), 之前追的 "o3 动态名单" 是这个误数导致的乌龙: gate 实测
// o3 分支从未加过任何 beyond-99 的 cmd, 本地 MMKV nt_mmkv_o3 override 实际空、非网络下发。
//
// 收敛过度签: 用真机 99 取代旧的 532 抄来超集。gate 实测 ret=0 的 InfoSync (RegisterProxy.SsoInfoSync)
// / Heartbeat (status_svc.SsoHeartBeat, Heartbeat.Alive) 不在 99 —— 真机发裸包不签而登录成功
// (旧"InfoSync 缺 sign 登录失败"是 reserve-len s21 误诊), 已不签。业务过度签 (媒体/群文件/踢人/
// fetchGroups 等 ~24 条) 同样不在 99。回滚: 若某 cmd 被 server 拒 (要 sign), 加进 LINUX_STATIC_SIGN。
// watch: 未单独抽取, 暂沿用同一份 99; watch trans_emp 由调用点 skipSign 排除。
export const SIGN_REQUIRED: Record<ProtocolName, ReadonlySet<string>> = {
  linux: new Set(LINUX_STATIC_SIGN),
  windows: new Set(LINUX_STATIC_SIGN),
  macos: new Set(LINUX_STATIC_SIGN),
  watch: new Set(LINUX_STATIC_SIGN),
}

/** 该 cmd 在当前平台是否需要签名。发包统一走这里判定。 */
export function cmdNeedsSign(cmd: string, platform: ProtocolName): boolean {
  return SIGN_REQUIRED[platform]?.has(cmd) ?? false
}

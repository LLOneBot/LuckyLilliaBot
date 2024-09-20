import { RequestUtil } from '@/common/utils/request'
import { Service, Context } from 'cordis'
import { Dict } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    ntWebApi: NTQQWebApi
  }
}

export enum WebHonorType {
  ALL = 'all',
  TALKACTIVE = 'talkative',
  PERFROMER = 'performer',
  LEGEND = 'legend',
  STORONGE_NEWBI = 'strong_newbie',
  EMOTION = 'emotion'
}

export interface WebApiGroupMember {
  uin: number
  role: number
  g: number
  join_time: number
  last_speak_time: number
  lv: {
    point: number
    level: number
  }
  card: string
  tags: string
  flag: number
  nick: string
  qage: number
  rm: number
}

interface WebApiGroupMemberRet {
  ec: number
  errcode: number
  em: string
  cache: number
  adm_num: number
  levelname: unknown
  mems: WebApiGroupMember[]
  count: number
  svr_time: number
  max_count: number
  search_count: number
  extmode: number
}

export class NTQQWebApi extends Service {
  static inject = ['ntUserApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntWebApi', true)
  }

  async getGroupMembers(groupCode: string): Promise<WebApiGroupMember[]> {
    const memberData: Array<WebApiGroupMember> = new Array<WebApiGroupMember>()
    const cookieObject = await this.ctx.ntUserApi.getCookies('qun.qq.com')
    const cookieStr = this.cookieToString(cookieObject)
    const retList: Promise<WebApiGroupMemberRet>[] = []
    const params = new URLSearchParams({
      st: '0',
      end: '40',
      sort: '1',
      gc: groupCode,
      bkn: this.genBkn(cookieObject.skey)
    })
    const fastRet = await RequestUtil.HttpGetJson<WebApiGroupMemberRet>(`https://qun.qq.com/cgi-bin/qun_mgr/search_group_members?${params}`, 'POST', '', { 'Cookie': cookieStr })
    if (!fastRet?.count || fastRet?.errcode !== 0 || !fastRet?.mems) {
      return []
    } else {
      for (const member of fastRet.mems) {
        memberData.push(member)
      }
    }
    const pageNum = Math.ceil(fastRet.count / 40)
    //遍历批量请求
    for (let i = 2; i <= pageNum; i++) {
      params.set('st', String((i - 1) * 40))
      params.set('end', String(i * 40))
      const ret = RequestUtil.HttpGetJson<WebApiGroupMemberRet>(`https://qun.qq.com/cgi-bin/qun_mgr/search_group_members?${params}`, 'POST', '', { 'Cookie': cookieStr })
      retList.push(ret)
    }
    //批量等待
    for (let i = 1; i <= pageNum; i++) {
      const ret = await (retList[i])
      if (!ret?.count || ret?.errcode !== 0 || !ret?.mems) {
        continue
      }
      for (const member of ret.mems) {
        memberData.push(member)
      }
    }
    return memberData
  }

  genBkn(sKey: string) {
    sKey = sKey || ''
    let hash = 5381
    for (let i = 0; i < sKey.length; i++) {
      const code = sKey.charCodeAt(i)
      hash = hash + (hash << 5) + code
    }
    return (hash & 0x7FFFFFFF).toString()
  }

  //实现未缓存 考虑2h缓存
  async getGroupHonorInfo(groupCode: string, getType: WebHonorType) {
    const getDataInternal = async (Internal_groupCode: string, Internal_type: number) => {
      const url = 'https://qun.qq.com/interactive/honorlist?gc=' + Internal_groupCode + '&type=' + Internal_type.toString()
      let resJson
      try {
        const res = await RequestUtil.HttpGetText(url, 'GET', '', { 'Cookie': cookieStr })
        const match = res.match(/window\.__INITIAL_STATE__=(.*?);/)
        if (match) {
          resJson = JSON.parse(match[1].trim())
        }
        if (Internal_type === 1) {
          return resJson?.talkativeList
        } else {
          return resJson?.actorList
        }
      } catch (e) {
        this.ctx.logger.error('获取当前群荣耀失败', url, e)
      }
      return undefined
    }

    const honorInfo: Dict = { group_id: groupCode }
    const cookieObject = await this.ctx.ntUserApi.getCookies('qun.qq.com')
    const cookieStr = this.cookieToString(cookieObject)

    if (getType === WebHonorType.TALKACTIVE || getType === WebHonorType.ALL) {
      try {
        const RetInternal = await getDataInternal(groupCode, 1)
        if (!RetInternal) {
          throw new Error('获取龙王信息失败')
        }
        honorInfo.current_talkative = {
          user_id: RetInternal[0]?.uin,
          avatar: RetInternal[0]?.avatar,
          nickname: RetInternal[0]?.name,
          day_count: 0,
          description: RetInternal[0]?.desc
        }
        honorInfo.talkative_list = [];
        for (const talkative_ele of RetInternal) {
          honorInfo.talkative_list.push({
            user_id: talkative_ele?.uin,
            avatar: talkative_ele?.avatar,
            description: talkative_ele?.desc,
            day_count: 0,
            nickname: talkative_ele?.name
          })
        }
      } catch (e) {
        this.ctx.logger.error(e)
      }
    }
    if (getType === WebHonorType.PERFROMER || getType === WebHonorType.ALL) {
      try {
        const RetInternal = await getDataInternal(groupCode, 2)
        if (!RetInternal) {
          throw new Error('获取群聊之火失败')
        }
        honorInfo.performer_list = []
        for (const performer_ele of RetInternal) {
          honorInfo.performer_list.push({
            user_id: performer_ele?.uin,
            nickname: performer_ele?.name,
            avatar: performer_ele?.avatar,
            description: performer_ele?.desc
          })
        }
      } catch (e) {
        this.ctx.logger.error(e)
      }
    }
    if (getType === WebHonorType.PERFROMER || getType === WebHonorType.ALL) {
      try {
        const RetInternal = await getDataInternal(groupCode, 3)
        if (!RetInternal) {
          throw new Error('获取群聊炽焰失败')
        }
        honorInfo.legend_list = []
        for (const legend_ele of RetInternal) {
          honorInfo.legend_list.push({
            user_id: legend_ele?.uin,
            nickname: legend_ele?.name,
            avatar: legend_ele?.avatar,
            desc: legend_ele?.description
          })
        }
      } catch (e) {
        this.ctx.logger.error('获取群聊炽焰失败', e)
      }
    }
    if (getType === WebHonorType.EMOTION || getType === WebHonorType.ALL) {
      try {
        const RetInternal = await getDataInternal(groupCode, 6)
        if (!RetInternal) {
          throw new Error('获取快乐源泉失败')
        }
        honorInfo.emotion_list = []
        for (const emotion_ele of RetInternal) {
          honorInfo.emotion_list.push({
            user_id: emotion_ele?.uin,
            nickname: emotion_ele?.name,
            avatar: emotion_ele?.avatar,
            desc: emotion_ele?.description
          })
        }
      } catch (e) {
        this.ctx.logger.error('获取快乐源泉失败', e)
      }
    }
    //冒尖小春笋好像已经被tx扬了
    if (getType === WebHonorType.EMOTION || getType === WebHonorType.ALL) {
      honorInfo.strong_newbie_list = []
    }
    return honorInfo
  }

  private cookieToString(cookieObject: Dict) {
    return Object.entries(cookieObject).map(([key, value]) => `${key}=${value}`).join('; ')
  }
}

import { OB11BaseNoticeEvent } from './OB11BaseNoticeEvent'

export interface OB11FlashFile {
  name: string,
  size: number,
  path?: string,
}


abstract class OB11FlashFileEvent extends OB11BaseNoticeEvent {
  notice_type = 'flash_file'
  sub_type: 'downloaded' | 'downloading' | 'uploaded' | 'uploading' | undefined
  title: string = ''
  share_link: string = ''
  file_set_id: string = ''
  files: Array<OB11FlashFile> = []

  protected constructor(title: string, share_link: string, file_set_id: string) {
    super()
    this.title = title
    this.share_link = share_link
    this.file_set_id = file_set_id
    this.files = []
  }
}

export class OB11FlashFileDownloadingEvent extends OB11FlashFileEvent {
  downloaded_size: number
  total_size: number
  speed: number
  remain_seconds: number

  constructor(title: string, share_link: string, file_set_id: string,
              downloaded_size: number, total_size: number,
              speed: number,
              remain_seconds: number,
              files: OB11FlashFile[]) {
    super(title, share_link, file_set_id)
    this.sub_type = 'downloading'
    this.downloaded_size = downloaded_size
    this.total_size = total_size
    this.speed = speed
    this.remain_seconds = remain_seconds
    this.files = files
  }
}

export class OB11FlashFileDownloadedEvent extends OB11FlashFileEvent {
  constructor(title: string, share_link: string, file_set_id: string) {
    super(title, share_link, file_set_id)
    this.sub_type = 'downloaded'
  }
}

export class OB11FlashFileUploadingEvent extends OB11FlashFileEvent {
  uploaded_size: number
  total_size: number
  speed: number
  remain_seconds: number

  constructor(title: string, share_link: string, file_set_id: string,
              uploaded_size: number, total_size: number,
              speed: number,
              remain_seconds: number,
              files: OB11FlashFile[] = []) {
    super(title, share_link, file_set_id)
    this.sub_type = 'uploading'
    this.uploaded_size = uploaded_size
    this.total_size = total_size
    this.speed = speed
    this.remain_seconds = remain_seconds
    this.files = files
  }
}

export class OB11FlashFileUploadedEvent extends OB11FlashFileEvent {
  constructor(title: string, share_link: string, file_set_id: string) {
    super(title, share_link, file_set_id)
    this.sub_type = 'uploaded'
  }
}

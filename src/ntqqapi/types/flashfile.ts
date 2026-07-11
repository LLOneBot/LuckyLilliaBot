
export enum FlashFileUploadStatus {
  // UPLOADING = 1,
  UPLOADED = 4,
}

export interface FlashFileSetInfo {
  fileSetId: string,
  name: string,
  totalFileCount: string,
  totalFileSize: string,
  shareInfo: {
    shareLink: string,
    extractionCode: string
  },
  uploaders: Array<{
    uin: string,
    nickname: string,
    uid: string,
    sendEntrance: string
  }>,
  uploadInfo: {
    totalUploadedFileSize: string,
    successCount: number,
    failedCount: number
  },
  expireTime: string,
  expireLeftTime: number,
  status: number,  // 2 是 ok？
  uploadStatus: FlashFileUploadStatus,
  downloadStatus: number, // 0 是未下载?
}

export interface FlashFileInfo {
  fileSetId: string,
  cliFileId: string,
  fileType: number,
  name: string,
  fileSize: string,
  saveFilePath?: string,
  status: number,
  uploadStatus: number,  // 3 是完成
  downloadStatus: number, // 3 是完成
  filePhysicalSize: string,
  physical: {
    id: string,
    status: number, // 2 是已完成?
    localPath: string,
  }
}

export interface FlashFileListItem {
  fileList: FlashFileInfo[],
  isEnd: boolean,
  isCache: boolean
}

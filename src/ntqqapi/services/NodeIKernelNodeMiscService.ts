export interface NodeIKernelNodeMiscService {
  wantWinScreenOCR(...args: unknown[]): Promise<{
    code: number
    errMsg: string
    result: {
      text: string
      [key: `pt${number}`]: {
        x: string
        y: string
      }
      charBox: unknown[]
      score: ''
    }[]
  }>

  queryAutoRun(): Promise<boolean>
}

import { IApiClient, IEventListener } from './interfaces.js'
import { AccountManager } from './AccountManager.js'

export type EventListenerFactory<C extends IApiClient, L extends IEventListener<any, any>> = (client: C) => L

export class TwoAccountTest<C extends IApiClient, L extends IEventListener<any, any>> {
  public readonly primaryListener: L
  public readonly secondaryListener: L

  constructor(
    private accountManager: AccountManager<C>,
    listenerFactory: EventListenerFactory<C, L>,
  ) {
    this.primaryListener = listenerFactory(accountManager.getPrimary())
    this.secondaryListener = listenerFactory(accountManager.getSecondary())
  }

  getAccountManager(): AccountManager<C> {
    return this.accountManager
  }

  getClient(account: 'primary' | 'secondary'): C {
    return account === 'primary' ? this.accountManager.getPrimary() : this.accountManager.getSecondary()
  }

  getListener(account: 'primary' | 'secondary'): L {
    return account === 'primary' ? this.primaryListener : this.secondaryListener
  }

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /** 执行后轮询 verifier, 直到通过或超时 */
  async executeAndVerify(
    action: () => Promise<any>,
    verifier: () => Promise<boolean>,
    timeout: number = 30000,
    retryInterval: number = 1000,
  ): Promise<{ actionResult: any; verified: boolean }> {
    const actionResult = await action()
    const startTime = Date.now()
    let verified = false
    while (Date.now() - startTime < timeout) {
      try {
        verified = await verifier()
        if (verified) break
      } catch {
        // 校验过程中抛错，继续轮询
      }
      await this.sleep(retryInterval)
    }
    if (!verified) {
      throw new Error(`Verification failed after ${timeout}ms`)
    }
    return { actionResult, verified }
  }

  async startAllListeners(): Promise<void> {
    await Promise.all([this.primaryListener.startListening(), this.secondaryListener.startListening()])
  }

  stopAllListeners(): void {
    this.primaryListener.stopListening()
    this.secondaryListener.stopListening()
  }

  clearAllQueues(): void {
    this.primaryListener.clearQueue()
    this.secondaryListener.clearQueue()
  }

  getPrimaryListener(): L {
    return this.primaryListener
  }

  getSecondaryListener(): L {
    return this.secondaryListener
  }
}

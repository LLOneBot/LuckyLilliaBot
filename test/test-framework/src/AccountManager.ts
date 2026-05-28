import { IApiClient, AccountConnectionConfig } from './interfaces.js'
import { TestConfig } from './ConfigLoader.js'

/** 协议自己实现：把 AccountConnectionConfig + retryAttempts 造出一个 IApiClient 实例 */
export type ApiClientFactory<C extends IApiClient> = (
  account: AccountConnectionConfig,
  retryAttempts: number,
) => C

/**
 * 双账号管理器。给定 TestConfig + 协议自己的 ApiClient factory，构造主/副 client。
 */
export class AccountManager<C extends IApiClient> {
  private primaryClient: C
  private secondaryClient: C

  constructor(config: TestConfig, factory: ApiClientFactory<C>) {
    this.primaryClient = factory(config.accounts.primary, config.retryAttempts)
    this.secondaryClient = factory(config.accounts.secondary, config.retryAttempts)
  }

  getPrimary(): C {
    return this.primaryClient
  }

  getSecondary(): C {
    return this.secondaryClient
  }

  disconnectAll(): void {
    this.primaryClient.disconnect()
    this.secondaryClient.disconnect()
  }
}

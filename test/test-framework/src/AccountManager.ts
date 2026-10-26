import { IApiClient, AccountConnectionConfig } from './interfaces.js'
import { TestConfig } from './ConfigLoader.js'

/** 由各协议提供 */
export type ApiClientFactory<C extends IApiClient> = (
  account: AccountConnectionConfig,
  retryAttempts: number,
) => C

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

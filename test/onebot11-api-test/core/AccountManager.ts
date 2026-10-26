import { ApiClient } from './ApiClient.js'
import { TestConfig } from '../config/ConfigLoader.js'
import { AccountManager as FrameworkAccountManager } from '../../test-framework/src/index.js'

export class AccountManager extends FrameworkAccountManager<ApiClient> {
  constructor(config: TestConfig) {
    super(config, (account, retries) => new ApiClient(account, retries))
  }
}

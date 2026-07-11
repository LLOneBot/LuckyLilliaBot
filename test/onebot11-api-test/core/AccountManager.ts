import { ApiClient } from './ApiClient.js'
import { TestConfig } from '../config/ConfigLoader.js'
import { AccountManager as FrameworkAccountManager } from '../../test-framework/src/index.js'

/**
 * OB11 测试用的账号管理器：注入 OB11 ApiClient factory 实例化 framework AccountManager。
 */
export class AccountManager extends FrameworkAccountManager<ApiClient> {
  constructor(config: TestConfig) {
    super(config, (account, retries) => new ApiClient(account, retries))
  }
}

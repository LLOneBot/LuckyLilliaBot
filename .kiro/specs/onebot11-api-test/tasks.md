# 实施计划

- [x] 1. 搭建项目基础结构
  - 在 test/onebot11-api-test 目录下创建项目结构
  - 配置 Jest 测试框架和 TypeScript
  - 安装依赖包（jest, fast-check, axios, ws, jest-html-reporter）
  - 创建 tsconfig.json 和 jest.config.js
  - _需求: 1.1, 5.1_

- [x] 2. 实现配置管理模块
  - 创建 config/test.config.json 配置文件模板
  - 实现 ConfigLoader 类，支持加载和验证配置
  - 定义 TestConfig 和 AccountConfig 接口
  - 实现配置错误处理（文件不存在、格式错误、字段缺失）
  - _需求: 1.1, 1.2, 1.3_

- [ ]* 2.1 编写属性测试：配置加载一致性
  - **属性 1: 配置加载一致性**
  - **验证需求: 1.1**

- [x] 3. 实现 HTTP API 客户端
  - 创建 ApiClient 类的 HTTP 调用方法
  - 使用 axios 实现 POST 请求
  - 实现请求头设置（Authorization）
  - 实现错误处理和重试机制
  - _需求: 2.1, 2.3_

- [ ]* 3.1 编写属性测试：HTTP 调用方法正确性
  - **属性 2: HTTP 调用方法正确性**
  - **验证需求: 2.1**

- [x] 4. 实现 WebSocket API 客户端
  - 创建 ApiClient 类的 WebSocket 调用方法
  - 使用 ws 库建立 WebSocket 连接
  - 实现消息发送和接收，支持 echo 字段验证
  - 实现连接管理和自动重连
  - _需求: 2.2, 2.3_

- [ ]* 4.1 编写属性测试：WebSocket echo 一致性
  - **属性 3: WebSocket 消息往返一致性**
  - **验证需求: 2.2**

- [x] 5. 实现账号管理器
  - 创建 AccountManager 类
  - 管理主账号和副账号的 ApiClient 实例
  - 提供 getPrimary() 和 getSecondary() 方法
  - _需求: 3.1, 3.2_


- [x] 6. 实现事件监听器
  - 创建 EventListener 类
  - 实现 WebSocket 事件监听
  - 实现事件过滤器（按类型、用户ID、群ID等）
  - 实现 waitForEvent 方法，支持超时机制
  - _需求: 3.4, 4.2_

- [ ]* 6.1 编写属性测试：事件监听超时机制
  - **属性 5: 事件监听超时机制**
  - **验证需求: 3.4, 4.2**

- [x] 7. 实现双账号测试工具类
  - 创建 TwoAccountTest 类
  - 实现 sendAndVerifyMessage 方法
  - 实现 addAndVerifyFriend 方法
  - 实现通用的 executeAndVerify 方法
  - _需求: 3.1, 3.2, 3.3, 4.1_

- [ ]* 7.1 编写属性测试：消息发送接收一致性
  - **属性 4: 消息发送接收一致性**
  - **验证需求: 3.1**

- [x] 8. 实现断言工具
  - 创建 Assertions 工具类
  - 实现常用断言方法（assertMessageReceived, assertFriendAdded 等）
  - 提供详细的错误信息
  - _需求: 4.3_

- [x] 9. 编写消息接口测试







  - 测试 send_msg（发送消息）
  - 测试 send_private_msg（发送私聊消息）
  - 测试 send_group_msg（发送群消息）
  - 测试 delete_msg（撤回消息）
  - 测试 get_msg（获取消息）
  - _需求: 6.1_

- [ ] 10. 编写好友接口测试
  - 测试 get_friend_list（获取好友列表）
  - 测试 set_friend_add_request（处理好友请求）
  - 测试 delete_friend（删除好友）
  - 测试 send_like（点赞）
  - _需求: 6.2_

- [ ] 11. 编写群组接口测试
  - 测试 get_group_list（获取群列表）
  - 测试 get_group_info（获取群信息）
  - 测试 get_group_member_list（获取群成员列表）
  - 测试 get_group_member_info（获取群成员信息）
  - 测试 set_group_add_request（处理加群请求）
  - 测试 set_group_kick（踢出群成员）
  - 测试 set_group_ban（禁言群成员）
  - 测试 set_group_admin（设置管理员）
  - 测试 set_group_card（设置群名片）
  - 测试 set_group_name（设置群名）
  - 测试 set_group_leave（退出群）
  - 测试 set_group_whole_ban（全员禁言）
  - 测试 get_group_honor_info（获取群荣誉信息）
  - _需求: 6.3_


- [ ] 12. 编写文件接口测试
  - 测试 get_file（获取文件）
  - 测试 get_image（获取图片）
  - 测试 get_record（获取语音）
  - 测试 upload_group_file（上传群文件）
  - 测试 upload_private_file（上传私聊文件）
  - 测试 get_group_root_files（获取群根目录文件）
  - 测试 get_group_files_by_folder（获取群文件夹文件）
  - 测试 create_group_file_folder（创建群文件夹）
  - 测试 delete_group_file（删除群文件）
  - 测试 delete_group_folder（删除群文件夹）
  - 测试 get_group_file_url（获取群文件下载链接）
  - 测试 get_group_file_system_info（获取群文件系统信息）
  - _需求: 6.4_

- [ ] 13. 编写系统接口测试
  - 测试 get_login_info（获取登录信息）
  - 测试 get_status（获取状态）
  - 测试 get_version_info（获取版本信息）
  - 测试 can_send_image（检查是否可发送图片）
  - 测试 can_send_record（检查是否可发送语音）
  - 测试 get_credentials（获取凭证）
  - 测试 get_csrf_token（获取 CSRF Token）
  - 测试 get_cookies（获取 Cookies）
  - 测试 clean_cache（清理缓存）
  - 测试 set_restart（重启）
  - _需求: 6.5_

- [ ] 14. 编写扩展接口测试
  - 测试 get_forward_msg（获取合并转发消息）
  - 测试 send_forward_msg（发送合并转发消息）
  - 测试 get_group_msg_history（获取群消息历史）
  - 测试 get_group_notice（获取群公告）
  - 测试 send_group_notice（发送群公告）
  - 测试 get_group_system_msg（获取群系统消息）
  - 测试 get_stranger_info（获取陌生人信息）
  - 测试 mark_msg_as_read（标记消息已读）
  - 测试 set_essence_msg（设置精华消息）
  - 测试 delete_essence_msg（删除精华消息）
  - 测试 get_group_essence（获取群精华消息）
  - 测试 ocr_image（图片 OCR）
  - 测试 download_file（下载文件）
  - 测试 get_group_at_all_remain（获取群 @全体成员剩余次数）
  - 测试 send_group_sign（群打卡）
  - 测试 set_group_portrait（设置群头像）
  - 测试 set_group_special_title（设置群成员专属头衔）
  - 测试 set_qq_profile（设置 QQ 资料）
  - 测试 _handle_quick_operation（快速操作）
  - _需求: 6.6_

- [ ] 15. 配置测试报告生成
  - 配置 jest-html-reporter
  - 设置报告输出路径和格式
  - 配置报告包含的信息（通过率、失败详情、执行时间）
  - _需求: 5.1, 5.2, 5.3_

- [ ] 16. 最终检查点
  - 确保所有测试通过，如有问题请咨询用户

# Implementation Plan: Runner-App Pairing

## Overview

本实施计划将配对功能分解为离散的编码任务，按照从基础设施到核心功能再到集成的顺序实施。每个任务都建立在前面任务的基础上，确保增量进展和早期验证。

## Tasks

- [x] 1. 设置项目基础设施和共享类型
  - 在 broker 项目中安装依赖：ioredis, @nestjs/redis
  - 创建共享类型定义文件（PairingCodeEntry, PairingSession, RateLimitEntry, PairingHistoryEntry, 错误码枚举）
  - 配置 Redis 连接模块
  - 设置测试框架（Jest + fast-check + ioredis-mock）
  - _Requirements: 所有需求的基础_

- [ ] 2. 实现配对码生成和验证
  - [x] 2.1 实现配对码生成器
    - 创建 PairingCodeGenerator 类
    - 使用 crypto.randomBytes 生成 9 位随机字符
    - 实现格式化为 XXX-XXX-XXX 的逻辑
    - 实现配对码格式验证函数
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [ ]* 2.2 编写配对码生成的属性测试
    - **Property 1: 配对码格式正确性**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - 验证生成的配对码符合格式要求
    - 验证字符集正确性
  
  - [ ]* 2.3 编写配对码唯一性测试
    - **Property 2: 配对码统计唯一性**
    - **Validates: Requirements 1.4**
    - 生成 10,000 个配对码，验证无重复

- [ ] 3. 实现 Broker 配对码管理服务
  - [x] 3.1 实现 PairingCodeService
    - 实现 registerCode 方法（使用 Redis SETNX）
    - 实现 validateCode 方法
    - 实现 invalidateCode 方法
    - 实现 findCodeByRunnerId 方法
    - 实现重试机制（最多 3 次）
    - _Requirements: 1.5, 3.2, 3.3, 4.2, 5.1, 5.4, 11.1, 11.2, 11.4_
  
  - [ ]* 3.2 编写配对码注册的属性测试
    - **Property 19: 配对码唯一性检查**
    - **Validates: Requirements 11.1, 11.2**
    - 验证重复配对码注册被拒绝
  
  - [ ]* 3.3 编写配对码验证的属性测试
    - **Property 4: 配对请求处理正确性**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
    - 验证各种配对码验证场景
  
  - [ ]* 3.4 编写配对码失效的单元测试
    - 测试 runner 断开后配对码失效
    - 测试配对码过期后失效
    - _Requirements: 4.2, 5.2_

- [ ] 4. 实现 Broker 配对会话管理服务
  - [x] 4.1 实现 PairingSessionService
    - 实现 createSession 方法（存储到 Redis）
    - 实现 getSession 方法
    - 实现 removeSession 方法
    - 实现 getAppsByRunnerId 方法（使用 Redis Set）
    - 实现 isRunnerOnline 方法（检查心跳）
    - _Requirements: 4.1, 4.4, 4.5, 7.1, 7.4, 8.1_
  
  - [ ]* 4.2 编写配对会话管理的属性测试
    - **Property 5: 配对会话创建和存储**
    - **Validates: Requirements 4.1**
    - **Property 9: 多 App 配对同一 Runner**
    - **Validates: Requirements 4.5**
    - 验证会话创建和多 app 配对
  
  - [ ]* 4.3 编写配对会话恢复的属性测试
    - **Property 8: App 断开保留配对关系**
    - **Validates: Requirements 4.4, 9.1, 9.5**
    - 验证 app 重连后配对关系恢复

- [ ] 5. 实现 Broker 速率限制服务
  - [x] 5.1 实现 RateLimitService
    - 实现 isBanned 方法
    - 实现 recordFailedAttempt 方法（使用 Redis Sorted Set 滑动窗口）
    - 实现 reset 方法
    - 实现 getRemainingBanTime 方法
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [ ]* 5.2 编写速率限制的单元测试
    - 测试 5 次失败后封禁
    - 测试封禁期间请求被拒绝
    - 测试封禁解除
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ]* 5.3 编写速率限制的属性测试
    - **Property 13: 速率限制封禁**
    - **Validates: Requirements 6.1, 6.2**
    - 验证速率限制机制

- [ ] 6. 实现 Broker 配对历史服务
  - [x] 6.1 实现 PairingHistoryService
    - 实现 record 方法（使用 Redis List）
    - 实现 getHistory 方法
    - 使用 LPUSH + LTRIM 保持最多 1000 条记录
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [ ]* 6.2 编写配对历史的属性测试
    - **Property 20: 配对历史记录**
    - **Validates: Requirements 12.1, 12.2**
    - **Property 21: 配对历史容量限制**
    - **Validates: Requirements 12.3, 12.4**
    - 验证历史记录和容量限制

- [-] 7. 实现 Broker WebSocket Gateway
  - [x] 7.1 创建 PairingGateway 类
    - 注入所有服务（PairingCodeService, PairingSessionService, RateLimitService, PairingHistoryService）
    - 实现连接管理（维护 runner 和 app 的 socket 映射）
    - 实现心跳机制（runner 每 10 秒发送心跳）
    - _Requirements: 所有需求的集成_
  
  - [x] 7.2 实现 runner:register 事件处理
    - 验证 runner secret
    - 调用 PairingCodeService.registerCode
    - 处理重复配对码（重试机制）
    - 更新 runner 心跳
    - 返回成功或错误响应
    - _Requirements: 1.5, 11.1, 11.2_
  
  - [x] 7.3 实现 app:pair 事件处理
    - 检查速率限制
    - 验证配对码格式
    - 调用 PairingCodeService.validateCode
    - 检查 runner 在线状态
    - 创建配对会话
    - 记录配对历史
    - 返回成功或错误响应
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 12.1, 12.2_
  
  - [x] 7.4 实现 app:pairing:status 事件处理
    - 查询配对会话
    - 检查 runner 在线状态
    - 返回配对状态
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 7.5 实现 app:unpair 事件处理
    - 删除配对会话
    - 保留 runner 配对码
    - 返回成功响应
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [x] 7.6 实现断开连接处理
    - Runner 断开：使配对码失效，通知已配对的 app
    - App 断开：保留配对关系
    - _Requirements: 4.2, 4.4, 9.2_
  
  - [ ]* 7.7 编写 Gateway 集成测试
    - 测试完整配对流程
    - 测试错误场景
    - 测试断线重连
    - _Requirements: 所有需求_

- [x] 8. Checkpoint - 确保 Broker 所有测试通过
  - 运行所有单元测试和属性测试
  - 验证 Redis 连接和操作
  - 检查错误处理
  - 如有问题，请询问用户

- [ ] 9. 实现 Runner 客户端
  - [x] 9.1 创建 RunnerClient 类
    - 实现 connect 方法（连接到 broker）
    - 实现配对码生成和注册
    - 实现心跳发送（每 10 秒）
    - 实现断线重连（保持相同配对码直到进程退出）
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.3_
  
  - [x] 9.2 实现配对码显示
    - 在控制台清晰显示配对码
    - 格式化输出（包含连字符）
    - _Requirements: 2.1, 2.2_
  
  - [x] 9.3 实现错误处理
    - 处理注册失败（重新生成配对码）
    - 处理网络错误（自动重连）
    - 记录错误日志
    - _Requirements: 10.1, 10.2, 10.3, 10.5_
  
  - [ ]* 9.4 编写 Runner 客户端的属性测试
    - **Property 3: 配对码持久性**
    - **Validates: Requirements 2.3**
    - 验证配对码在进程生命周期内保持不变
  
  - [ ]* 9.5 编写 Runner 重连的单元测试
    - 测试断线重连流程
    - 测试配对码保持不变
    - _Requirements: 2.3, 9.2_

- [x] 10. 实现 App 客户端
  - [x] 10.1 创建 AppClient 类
    - 实现 connect 方法（连接到 broker，使用 JWT 认证）
    - 实现 pair 方法（发送配对请求）
    - 实现 getPairingStatus 方法
    - 实现 unpair 方法
    - 实现断线重连（恢复配对关系）
    - _Requirements: 3.1, 7.1, 8.1, 9.1, 9.5_
  
  - [x] 10.2 实现错误处理
    - 处理各种配对错误（格式错误、配对码不存在、过期、速率限制、runner 离线）
    - 显示用户友好的错误消息
    - 实现自动重连（指数退避）
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  
  - [ ]* 10.3 编写 App 客户端的单元测试
    - 测试配对流程
    - 测试错误处理
    - 测试断线重连
    - _Requirements: 3.1, 7.1, 8.1, 9.1_

- [x] 11. 实现 React Native UI 组件
  - [x] 11.1 创建 PairingScreen 组件
    - 实现配对码输入界面（3 个输入框，每个 3 个字符）
    - 实现自动格式化（自动添加连字符）
    - 实现提交按钮
    - 显示配对状态和错误信息
    - _Requirements: 3.1, 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [x] 11.2 实现配对状态显示
    - 显示当前配对的 runner
    - 显示 runner 在线状态
    - 提供解除配对按钮
    - _Requirements: 7.2, 7.3, 8.1_
  
  - [ ]* 11.3 编写 UI 组件测试
    - 使用 React Native Testing Library
    - 测试用户交互
    - 测试错误显示
    - _Requirements: 3.1, 7.1, 8.1_

- [ ] 12. 实现端到端集成测试
  - [ ]* 12.1 编写完整配对流程测试
    - Runner 启动 → 生成配对码 → App 输入配对码 → 配对成功
    - 验证消息正确路由
    - _Requirements: 所有核心需求_
  
  - [ ]* 12.2 编写断线重连场景测试
    - 测试 Runner 断线重连
    - 测试 App 断线重连
    - 验证配对关系正确更新
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ]* 12.3 编写多客户端场景测试
    - 多个 app 同时与一个 runner 配对
    - 验证消息正确路由
    - _Requirements: 4.5_
  
  - [ ]* 12.4 编写错误场景测试
    - 测试各种错误情况
    - 验证错误处理和恢复
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 13. 实现配对码时效性和清理机制
  - [x] 13.1 实现配对码过期检查
    - 在 validateCode 中检查过期时间
    - 自动清理过期配对码（依赖 Redis TTL）
    - _Requirements: 5.2, 5.4_
  
  - [x] 13.2 实现已使用配对码的持续有效性
    - 在首次配对成功后，标记配对码为已使用
    - 已使用的配对码不受 24 小时限制
    - _Requirements: 5.3_
  
  - [ ]* 13.3 编写配对码时效性的属性测试
    - **Property 10: 配对码时效性**
    - **Validates: Requirements 5.2**
    - **Property 11: 已使用配对码持续有效**
    - **Validates: Requirements 5.3**
    - **Property 12: 配对码失效后清理**
    - **Validates: Requirements 5.4, 11.4**

- [x] 14. 实现 Runner 重连通知机制
  - [x] 14.1 实现 runner 重连时的通知
    - 当 runner 重新连接时，查找所有已配对的 app
    - 向所有 app 发送 runner:online 事件
    - _Requirements: 9.3_
  
  - [x] 14.2 实现 app 处理 runner 重连通知
    - 接收 runner:online 事件
    - 更新 UI 显示 runner 在线状态
    - 提示用户需要重新配对（如果配对码已更新）
    - _Requirements: 9.3, 9.4_
  
  - [ ]* 14.3 编写 runner 重连通知的属性测试
    - **Property 17: Runner 重连通知**
    - **Validates: Requirements 9.3**
    - **Property 18: 旧配对码失效**
    - **Validates: Requirements 9.4**

- [x] 15. 实现配对状态查询功能
  - [x] 15.1 完善配对状态查询逻辑
    - 查询配对会话
    - 检查 runner 在线状态
    - 返回完整的配对状态信息
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 15.2 编写配对状态查询的属性测试
    - **Property 15: 配对状态查询正确性**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 16. 实现解除配对功能
  - [x] 16.1 完善解除配对逻辑
    - 删除配对会话
    - 保留 runner 配对码
    - 验证解除后无法发送命令
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 16.2 编写解除配对的属性测试
    - **Property 16: 解除配对效果**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 17. 实现 Runner 断开和重连的完整流程
  - [x] 17.1 完善 runner 断开处理
    - 使配对码失效
    - 清理配对会话
    - 通知已配对的 app
    - _Requirements: 4.2, 9.2_
  
  - [x] 17.2 完善 runner 重连处理
    - 生成新配对码
    - 重新注册
    - 通知已配对的 app
    - _Requirements: 4.3, 9.2, 9.3_
  
  - [ ]* 17.3 编写 runner 断开和重连的属性测试
    - **Property 6: Runner 断开使配对码失效**
    - **Validates: Requirements 4.2, 9.2**
    - **Property 7: Runner 重连生成新配对码**
    - **Validates: Requirements 4.3, 9.2**

- [x] 18. 添加日志和监控
  - [x] 18.1 实现结构化日志
    - 记录所有配对事件
    - 记录所有错误
    - 使用 JSON 格式
    - 敏感信息脱敏（secret, token, 部分配对码）
    - _Requirements: 6.4, 12.1, 12.2_
  
  - [x] 18.2 添加性能监控指标
    - 监控活跃连接数
    - 监控配对成功率
    - 监控平均响应时间
    - 监控错误率
    - _Requirements: 所有需求_

- [x] 19. 编写文档和部署指南
  - [x] 19.1 编写 API 文档
    - 文档化所有 Socket.io 事件
    - 提供请求和响应示例
    - 说明错误码
  
  - [x] 19.2 编写部署指南
    - Redis 配置说明
    - 环境变量配置
    - 高可用部署方案
    - 监控和日志配置

- [x] 20. Final Checkpoint - 确保所有测试通过
  - 运行所有单元测试、属性测试和集成测试
  - 验证所有需求都已实现
  - 检查代码覆盖率（目标 > 90%）
  - 进行性能测试
  - 如有问题，请询问用户

## Notes

- 任务标记 `*` 的为可选任务，可以跳过以加快 MVP 开发
- 每个任务都引用了具体的需求，便于追溯
- Checkpoint 任务确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证特定示例和边缘情况
- 所有配对码操作都使用 Redis 保证原子性和唯一性
- 使用 fast-check 进行属性测试，每个测试至少运行 100 次迭代

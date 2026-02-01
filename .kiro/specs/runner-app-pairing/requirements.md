# Requirements Document

## Introduction

本文档定义了远程终端控制系统的配对功能需求。该系统由三个组件组成：runner（被控制端服务）、app（移动控制端）和 broker（中间层服务器）。配对功能允许 app 通过输入配对码安全地与特定 runner 建立控制关系。

## Glossary

- **Runner**: 运行在被控制端的 Node.js 服务，通过 PTY 提供终端访问能力
- **App**: React Native 移动应用，用于远程控制终端
- **Broker**: NestJS WebSocket 服务器，作为中间层转发消息并管理配对关系
- **Pairing_Code**: 9位配对码，由英文字母和数字组成，格式为 XXX-XXX-XXX
- **Pairing_Session**: 配对会话，表示 app 与 runner 之间的配对关系
- **Runner_ID**: runner 的唯一标识符
- **Session_ID**: WebSocket 连接会话的唯一标识符

## Requirements

### Requirement 1: 配对码生成

**User Story:** 作为 runner 管理员，我希望 runner 启动时自动生成唯一的配对码，以便用户可以通过该配对码将 app 与 runner 配对。

#### Acceptance Criteria

1. WHEN runner 启动时，THE Runner SHALL 生成一个由 9 个字符组成的配对码
2. THE Pairing_Code SHALL 仅包含大写英文字母（A-Z）和数字（0-9）
3. THE Pairing_Code SHALL 格式化为 XXX-XXX-XXX 形式（三组字符，用连字符分隔）
4. THE Pairing_Code SHALL 在统计学上具有唯一性（碰撞概率低于 0.001%）
5. WHEN runner 向 broker 注册时，THE Runner SHALL 将配对码发送给 broker

### Requirement 2: 配对码展示

**User Story:** 作为 runner 管理员，我希望在终端中清晰地看到配对码，以便我可以将其提供给需要连接的用户。

#### Acceptance Criteria

1. WHEN runner 成功连接到 broker 后，THE Runner SHALL 在控制台输出配对码
2. THE Runner SHALL 以易于阅读的格式显示配对码（包含连字符分隔）
3. WHEN runner 断线重连时，THE Runner SHALL 保持相同的配对码直到进程退出

### Requirement 3: 配对请求处理

**User Story:** 作为 app 用户，我希望通过输入配对码来与特定的 runner 建立配对关系，以便我可以远程控制该终端。

#### Acceptance Criteria

1. WHEN app 用户提交配对码时，THE App SHALL 向 broker 发送配对请求
2. WHEN broker 收到配对请求时，THE Broker SHALL 验证配对码格式是否正确
3. WHEN 配对码格式正确时，THE Broker SHALL 查找对应的 runner
4. WHEN 找到匹配的 runner 时，THE Broker SHALL 创建配对会话并返回 runner_id
5. WHEN 配对码不存在或已失效时，THE Broker SHALL 返回错误信息

### Requirement 4: 配对会话管理

**User Story:** 作为系统架构师，我希望 broker 能够管理配对会话的生命周期，以确保配对关系的正确性和安全性。

#### Acceptance Criteria

1. WHEN 配对成功时，THE Broker SHALL 存储配对关系（app session_id 到 runner_id 的映射）
2. WHEN runner 断开连接时，THE Broker SHALL 使该 runner 的配对码失效
3. WHEN runner 重新连接时，THE Broker SHALL 生成新的配对码
4. WHEN app 断开连接时，THE Broker SHALL 保留配对关系（允许 app 重连）
5. THE Broker SHALL 允许一个 runner 同时与多个 app 配对

### Requirement 5: 配对码时效性

**User Story:** 作为安全管理员，我希望配对码具有时效性，以防止未授权访问和配对码泄露风险。

#### Acceptance Criteria

1. WHEN 配对码生成后，THE Broker SHALL 记录生成时间戳
2. WHEN 配对码超过 24 小时未使用时，THE Broker SHALL 自动使其失效
3. WHEN 配对码已被使用（至少一次成功配对）时，THE Broker SHALL 允许该配对码继续有效直到 runner 断开
4. WHEN 配对码失效时，THE Broker SHALL 从配对码注册表中移除该记录

### Requirement 6: 防暴力破解

**User Story:** 作为安全管理员，我希望系统能够防止暴力破解配对码，以保护系统安全。

#### Acceptance Criteria

1. WHEN 同一 app session 在 1 分钟内尝试配对失败超过 5 次时，THE Broker SHALL 临时封禁该 session 5 分钟
2. WHEN app session 被封禁时，THE Broker SHALL 拒绝该 session 的所有配对请求
3. WHEN 封禁时间到期后，THE Broker SHALL 自动解除封禁
4. THE Broker SHALL 记录所有失败的配对尝试（包括时间戳和 session_id）

### Requirement 7: 配对状态查询

**User Story:** 作为 app 用户，我希望能够查询当前的配对状态，以便了解我是否已与某个 runner 配对。

#### Acceptance Criteria

1. WHEN app 连接到 broker 时，THE Broker SHALL 检查该 app 是否已有配对关系
2. WHEN app 已配对时，THE Broker SHALL 返回配对的 runner_id 和配对状态
3. WHEN app 未配对时，THE Broker SHALL 返回未配对状态
4. WHEN app 查询配对状态时，THE Broker SHALL 验证配对的 runner 是否仍在线

### Requirement 8: 配对解除

**User Story:** 作为 app 用户，我希望能够主动解除与 runner 的配对关系，以便在不需要时断开连接。

#### Acceptance Criteria

1. WHEN app 发送解除配对请求时，THE Broker SHALL 删除该 app 与 runner 的配对关系
2. WHEN 配对关系被解除后，THE App SHALL 无法再向该 runner 发送命令
3. WHEN 配对关系被解除后，THE Broker SHALL 保留 runner 的配对码（允许其他 app 配对）
4. THE Broker SHALL 通知 app 配对已成功解除

### Requirement 9: 断线重连处理

**User Story:** 作为系统架构师，我希望系统能够正确处理断线重连场景，以确保配对关系的持久性和一致性。

#### Acceptance Criteria

1. WHEN app 断线后重新连接时，THE Broker SHALL 恢复之前的配对关系（如果 runner 仍在线）
2. WHEN runner 断线后重新连接时，THE Broker SHALL 生成新的配对码
3. WHEN runner 重连时，THE Broker SHALL 通知所有已配对的 app 该 runner 已重新上线
4. WHEN runner 重连后，THE App SHALL 需要使用新的配对码重新配对
5. WHEN app 重连时使用旧的 session_id，THE Broker SHALL 识别并恢复配对关系

### Requirement 10: 错误处理和反馈

**User Story:** 作为开发者，我希望系统能够提供清晰的错误信息，以便用户和开发者能够快速定位和解决问题。

#### Acceptance Criteria

1. WHEN 配对码格式错误时，THE Broker SHALL 返回 "INVALID_FORMAT" 错误
2. WHEN 配对码不存在时，THE Broker SHALL 返回 "CODE_NOT_FOUND" 错误
3. WHEN 配对码已过期时，THE Broker SHALL 返回 "CODE_EXPIRED" 错误
4. WHEN app 被临时封禁时，THE Broker SHALL 返回 "RATE_LIMITED" 错误和剩余封禁时间
5. WHEN runner 离线时，THE Broker SHALL 返回 "RUNNER_OFFLINE" 错误
6. WHEN 网络错误发生时，THE App SHALL 显示用户友好的错误提示
7. WHEN 配对成功时，THE Broker SHALL 返回成功状态和 runner_id

### Requirement 11: 配对码唯一性保证

**User Story:** 作为系统架构师，我希望确保配对码在系统中的唯一性，以避免配对冲突。

#### Acceptance Criteria

1. WHEN broker 收到新的配对码注册请求时，THE Broker SHALL 检查该配对码是否已存在
2. IF 配对码已存在，THEN THE Broker SHALL 拒绝注册并要求 runner 重新生成
3. THE Broker SHALL 维护一个活跃配对码的注册表
4. WHEN 配对码失效时，THE Broker SHALL 从注册表中移除该配对码以允许重用

### Requirement 12: 配对历史记录

**User Story:** 作为系统管理员，我希望系统能够记录配对历史，以便进行审计和问题排查。

#### Acceptance Criteria

1. WHEN 配对成功时，THE Broker SHALL 记录配对事件（包括时间戳、app session_id、runner_id）
2. WHEN 配对失败时，THE Broker SHALL 记录失败原因和尝试的配对码
3. THE Broker SHALL 保留最近 1000 条配对历史记录
4. WHEN 历史记录超过 1000 条时，THE Broker SHALL 删除最旧的记录

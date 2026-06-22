# 模型 1M 上下文声明 — 设计文档

日期：2026-06-22
状态：已批准设计，待实现

## 背景与问题

第三方 API 配置（如 GLM、各类中转端点）映射的模型（例如 `glm-5`）可能支持 1M 上下文窗口，
但 Claude Code 无法从一个陌生模型名推断其上下文窗口，默认按 200K 处理，导致自动压缩（auto-compact）
过早触发、`/model` 里也不出现 1M 变体。

类似工具 CC Switch 在「模型映射」里为每个角色提供「声明支持 1M」勾选框。本应用目前没有该能力。

## 机制（已查证，Claude Code 官方文档）

在 env 变量的模型名后追加 `[1m]` 后缀即可向 Claude Code 声明该模型按 1M 上下文对待：

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL='glm-5[1m]'
```

要点：
- Claude Code **发给上游前会剥掉 `[1m]`**，第三方端点收到的仍是 `glm-5`。
- 后缀**按变量逐个读取**，作用于该变量对应的 alias。
- 官方文档明确确认支持 `[1m]` 的变量：`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、
  `ANTHROPIC_DEFAULT_OPUS_MODEL`。
- 官方只有 Sonnet / Opus / Fable 系支持 1M；Haiku 不支持。`CLAUDE_CODE_SUBAGENT_MODEL` 的
  `[1m]` 行为文档未确认。
- `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` 可全局关闭（本设计不涉及）。

来源：Claude Code 官方 model-config 文档「Pin models for third-party deployments / Extended context」。

## 范围

- **仅第三方配置生效**。官方配置（`isOfficial`）的 `profileToEnv` 直接 `return {}`，不注入任何
  `ANTHROPIC_*`；所有 `[1m]` 逻辑都放在该 early-return 之后，官方天然不受影响。
- **覆盖 3 个模型角色**：默认模型（`ANTHROPIC_MODEL`）、Sonnet（`ANTHROPIC_DEFAULT_SONNET_MODEL`）、
  Opus（`ANTHROPIC_DEFAULT_OPUS_MODEL`）。
- **不覆盖** Haiku（官方不支持 1M）与 Subagent（`[1m]` 行为未确认，避免无效/报错）。

### 范围外

- 旁边已失效的 `contextWindow` 数字框（历史遗留，从未被注入 env）本次不动。
- 全局开关 `CLAUDE_CODE_DISABLE_1M_CONTEXT` 不做。

## 设计

### 1. 数据模型

`src/renderer/src/types/settings.ts` 的 `ApiProfile` 新增 3 个可选布尔（扁平风格，对齐现有
`sonnetModel` 等字段）：

```ts
/** [2026-06-22] 声明对应模型支持 1M 上下文：注入 env 时给模型名追加 [1m] 后缀 */
model1m?: boolean        // 默认模型 ANTHROPIC_MODEL
sonnetModel1m?: boolean  // ANTHROPIC_DEFAULT_SONNET_MODEL
opusModel1m?: boolean    // ANTHROPIC_DEFAULT_OPUS_MODEL
```

`undefined` 即关闭。旧配置无需迁移。`createDefaultProfile` / `OFFICIAL_PROFILE` 无需改（默认即关）。

### 2. env 注入

`src/main/settingsStore.ts` 的 `profileToEnv` 与 `profileToEnvWithProxy`，均在 `if (profile.isOfficial) return {}`
**之后**，用一个本地 helper 追加后缀：

```ts
const add1m = (m: string, on?: boolean): string =>
  on && m && !/\[1m\]$/i.test(m) ? `${m}[1m]` : m
```

应用到 3 个字段：

```ts
ANTHROPIC_MODEL: add1m(profile.model, profile.model1m),
ANTHROPIC_DEFAULT_SONNET_MODEL: add1m(profile.sonnetModel, profile.sonnetModel1m),
ANTHROPIC_DEFAULT_OPUS_MODEL: add1m(profile.opusModel, profile.opusModel1m),
```

其余字段（Haiku / Subagent / token / baseUrl 等）不变。

- 幂等：`!/\[1m\]$/i.test(m)` 防止用户手动已写 `[1m]` 时重复追加。
- 空模型名不追加（`m` 为空时返回空，由 `filterEnvRecord` 过滤）。
- 变量名不变，`ptyManager.ts` 的 `PTY_ENV_STRIP`（切换配置防残留）无需改动。

### 3. UI

`src/renderer/src/components/settings/SettingsPanel.tsx` 有两处编辑入口，使用同一份模型行 `.map`：
- 侧栏内联编辑（活跃配置，约 847–865 行）
- 弹窗表单（新增/编辑配置，约 1408–1426 行）

改造：把行元组从 `[modelKey, label, hint]` 扩展为 `[modelKey, label, hint, oneMKey?]`，
其中 `oneMKey` 为对应的 1M 布尔字段名（仅 默认/Sonnet/Opus 行有）：

```ts
['model',       '默认模型',      'ANTHROPIC_MODEL',                 'model1m'],
['sonnetModel', 'Sonnet Model',  'ANTHROPIC_DEFAULT_SONNET_MODEL',  'sonnetModel1m'],
['haikuModel',  'Haiku Model',   'ANTHROPIC_DEFAULT_HAIKU_MODEL'],
['opusModel',   'Opus Model',    'ANTHROPIC_DEFAULT_OPUS_MODEL',    'opusModel1m'],
['subagentModel','Subagent Model','CLAUDE_CODE_SUBAGENT_MODEL'],
```

渲染：有 `oneMKey` 的行，在输入框右侧加一个紧凑「1M」勾选框（label + checkbox），
通过 `handleProfileChange(oneMKey, !value)` / `handleChange(oneMKey, !value)` 切换。
Haiku / Subagent 行外观不变。两处复用同一渲染逻辑。

### 4. i18n

`src/renderer/src/i18n/zh.ts` 与 `en.ts` 新增：
- 勾选框标签：`声明支持 1M` / `Declare 1M`
- 说明文案（区域顶部或 hint）：`只是给 Claude Code 的上下文能力声明，发给上游前会自动去掉 [1m]` /
  `Capability declaration for Claude Code only; [1m] is stripped before reaching your provider`

### 5. 生效时机

与修改模型名一致：env 在创建/重启会话时注入，已运行的会话需重启（切换配置 / restart）才生效。
说明文案点明这一点，不做自动重启。

## 单元边界

- **数据层**（settings.ts）：纯类型新增，无行为。
- **env 构建**（settingsStore.ts）：`add1m` 是纯函数，输入模型名 + 布尔 → 输出带/不带后缀的字符串，
  可独立推理与测试。
- **UI**（SettingsPanel.tsx）：仅新增受控勾选框，读写 profile 字段，不引入新副作用。

三者通过 `ApiProfile` 字段这一明确接口耦合，互不侵入。

## 测试

- `add1m` 纯函数：`('glm-5', true)→'glm-5[1m]'`、`('glm-5', false)→'glm-5'`、
  `('glm-5[1m]', true)→'glm-5[1m]'`（幂等）、`('', true)→''`。
- 官方配置：`profileToEnv(OFFICIAL_PROFILE)` 仍为 `{}`（即使带 1M 标志）。
- 手动验证：第三方配置勾选 Sonnet 1M → 重启会话 → 终端内 `/status` 或 env 显示 1M；上游实际请求模型名不含 `[1m]`。

## 验收标准

1. 第三方配置的 默认/Sonnet/Opus 行各有一个「1M」勾选框，可保存、可回显。
2. 勾选后重启会话，对应 `ANTHROPIC_*` 变量值带 `[1m]` 后缀；未勾选不带。
3. 官方配置完全不受影响（仍不注入任何 `ANTHROPIC_*`）。
4. Haiku / Subagent 行无勾选框。
5. 已手动写 `[1m]` 的模型名不会被重复追加。

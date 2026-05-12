/** [2026-05-08] 发版时在对应版本下补充要点；无条目时用 fallbackWhatsNewCopy */

export interface WhatsNewCopy {
  titleZh: string
  titleEn: string
  bulletsZh: string[]
  bulletsEn: string[]
}

const ENTRIES: Record<string, WhatsNewCopy> = {
  '0.7.9': {
    titleZh: 'Feng Claude 0.7.9 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.9",
    bulletsZh: [
      'Office 文件预览：侧栏新增 Office 标签页，双击 docx/xlsx/pptx 文件即可预览；PPTX 走 office-cli SVG 高保真渲染',
      '元素/单元格选择器：预览面板 @ 按钮拾取 PPT 形状 / Excel 单元格，自动注入 @path 引用到外嵌输入框',
      '宠物 21 点 Blackjack 小游戏：token 消耗换算游戏币，下注要牌即时结算',
      '流式 token 统计修复：跳过中间快照，input token 不再重复计数',
      '@ 路径外嵌发送修复：尾部空格防补全，输入正确送达 PTY'
    ],
    bulletsEn: [
      'Office file preview: new Office sidebar tab; double-click docx/xlsx/pptx to preview; PPTX renders via office-cli SVG with full fidelity',
      'Element/cell picker: @ button in preview panel captures PPT shapes / Excel cells, injects @path refs into embed input',
      'Pet Blackjack: token consumption converted to chips, bet and play with instant results',
      'Streaming token stats fix: skip intermediate snapshots, input tokens no longer double-counted',
      '@ path embed send fix: trailing space prevents autocomplete, input reliably reaches PTY'
    ]
  },
  '0.7.7': {
    titleZh: 'Feng Claude 0.7.7 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.7",
    bulletsZh: [
      '修复大历史项目点击外嵌界面卡死：首帧只扫描尾部窗口，搜索时才全量扫描',
      '历史消息“已播放”标记改为批量写入 localStorage，避免数千次同步写入卡顿',
      '新增外嵌性能日志，便于继续定位项目级历史规模问题'
    ],
    bulletsEn: [
      'Fix embed freeze on projects with large transcript history: initial render scans only the tail window',
      'Batch localStorage writes for revealed historical messages to avoid thousands of synchronous writes',
      'Add embed performance diagnostics for project-specific history issues'
    ]
  },
  '0.7.4': {
    titleZh: 'Feng Claude 0.7.4 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.4",
    bulletsZh: [
      '字体改为本地打包（DM Sans / VT323 / Share Tech Mono），不再从 Google 拉取，离线与严格 CSP 均可用',
      '修复正式包下 preload 偶发「m is not defined」',
      '完整变更见 CHANGELOG'
    ],
    bulletsEn: [
      'Fonts ship locally (@fontsource woff2); no Google Fonts fetch; works offline with strict CSP',
      'Fix rare packaged preload error: m is not defined',
      'See CHANGELOG for details'
    ]
  },
  '0.7.3': {
    titleZh: 'Feng Claude 0.7.3 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.3",
    bulletsZh: [
      '外嵌多行输入：正文与回车分两帧发送，修复斜杠 TUI 下多行内容无法提交的问题',
      'PTY 发送带回传 ACK（可选 traceId），便于确认内容是否写入终端',
      '斜杠命令识别收紧；以 /** 开头的多行不再误判为命令',
      '斜杠交互仅保留「中断」，去掉单独的「强制退出」',
      '完整变更见 CHANGELOG；README「内置 MCP 与上游说明」列出 office-cli、browser-tools、visual-agent'
    ],
    bulletsEn: [
      'Embed multiline: body and Enter sent in two steps so slash TUIs submit reliably',
      'PTY send acknowledgment (optional traceId) to verify input reached the terminal',
      'Stricter slash-command detection; multiline blocks starting with /** are not treated as commands',
      'Slash TUI: single Interrupt action; removed separate force-exit control',
      'See CHANGELOG; README Bundled MCPs section lists office-cli, browser-tools, visual-agent'
    ]
  },
  '0.6.9': {
    titleZh: 'Feng Claude 0.6.9 更新摘要',
    titleEn: "What's new in Feng Claude 0.6.9",
    bulletsZh: [
      '新版本介绍：首次进入本版本时自动弹出要点，点「知道了」后同一版本不再提示',
      'Telegram：安装说明里配对文案与路径解析优化，减少误用默认 channels 目录',
      'Windows：关标签/退出时尽量结束整棵 PTY 子进程，减轻 Bun / Claude 残留'
    ],
    bulletsEn: [
      "What's New dialog on first launch after install/upgrade; dismissed once per version",
      'Telegram setup guide: shorter pairing copy and better state-dir resolution from the tab bar',
      'Windows: tear down the PTY process tree on tab close/quit to reduce stray Bun/Claude processes'
    ]
  }
}

export function getWhatsNewCopy(version: string): WhatsNewCopy | null {
  const v = (version ?? '').trim()
  if (!v) return null
  return ENTRIES[v] ?? null
}

export function fallbackWhatsNewCopy(version: string): WhatsNewCopy {
  const v = (version ?? '').trim() || '—'
  return {
    titleZh: `已更新至 v${v}`,
    titleEn: `Updated to v${v}`,
    bulletsZh: ['感谢使用。完整变更请见项目 CHANGELOG。'],
    bulletsEn: ['Thanks for updating. See CHANGELOG for full history.']
  }
}

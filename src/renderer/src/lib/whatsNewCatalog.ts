/** [2026-05-08] 发版时在对应版本下补充要点；无条目时用 fallbackWhatsNewCopy */

export interface WhatsNewCopy {
  titleZh: string
  titleEn: string
  bulletsZh: string[]
  bulletsEn: string[]
}

const ENTRIES: Record<string, WhatsNewCopy> = {
  '0.7.14': {
    titleZh: 'Feng Claude 0.7.14 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.14",
    bulletsZh: [
      '图片预览：文件树双击图片文件（png/jpg/gif/webp/svg/avif 等）即可在分屏窗格内预览，与文本编辑器共用分屏逻辑',
      '文本编辑器增强：保存失败提示条、底部状态栏（行/列/文件大小）、从磁盘重新加载、行号显示',
      'Ctrl+F 查找修复：字符级精准高亮，关闭折行，高亮位置不再偏移',
    ],
    bulletsEn: [
      'Image preview: double-click png/jpg/gif/webp/svg/avif etc. in the file tree to preview in the split pane alongside the text editor',
      'Text editor enhancements: save-failure error bar, status bar (line/col/size), reload-from-disk button, line numbers',
      'Ctrl+F find fix: accurate character-level highlight boxes, wrap="off" prevents line-shift after long lines',
    ]
  },
  '0.7.13': {
    titleZh: 'Feng Claude 0.7.13 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.13",
    bulletsZh: [
      '文本文件编辑器：双击文件树中任意文本文件即可在右侧分栏打开，支持行号、Ctrl+F 搜索、保存提示、未保存警告',
      '外嵌进程退出检测：PTY 退出时底部红色提示 + 一键重启按钮，输入框自动禁用',
      '外嵌历史加载提速：限制最多读取最近 25 个 JSONL 文件及 8 MB 总量，长期项目打开外嵌不再卡顿',
    ],
    bulletsEn: [
      'Text file editor: double-click any text file in the file tree to open it in a split pane; line numbers, Ctrl+F search, save indicator, unsaved-changes warning',
      'Embed dead-process detection: red banner + one-click restart when PTY exits; input auto-disabled',
      'Embed history hydration speedup: capped at 25 most-recent JSONL files and 8 MB total; eliminates freeze on long-lived projects',
    ]
  },
  '0.7.12': {
    titleZh: 'Feng Claude 0.7.12 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.12",
    bulletsZh: [
      'OfficeCLI 内置 MCP：自动下载并注册，MCP 面板可查看版本/进度/一键更新，支持 docx/xlsx/pptx 读写',
      '宠物进食动画：小饼干/小鱼干/豪华套餐三种食物各有专属多帧动画与随机台词',
      '外嵌进程退出检测：PTY 退出时显示红色提示条 + 一键重启按钮，输入框自动禁用',
      '外嵌上下文环形图：实时显示上下文占用百分比，超 75% 变橙、超 92% 变红',
      '修复 Agent 历史调用显示 no call data，现完整展示 prompt',
      '修复宠物食物购买重启后扣费失效的 bug',
    ],
    bulletsEn: [
      'OfficeCLI built-in MCP: auto-download and register; MCP panel shows version/progress/update button; handles docx/xlsx/pptx',
      'Pet eating animations: cookie/fish/meal each have unique multi-frame animations with random speech lines',
      'Embed dead-process detection: red banner + one-click restart when PTY exits; input auto-disabled',
      'Embed context usage ring: live context % ring; turns orange at 75%, red at 92%',
      'Fix Agent historical calls showing "no call data"; prompt now fully displayed',
      'Fix pet food purchase coins refunded on restart (lastCoinSyncCost now persisted)',
    ]
  },
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

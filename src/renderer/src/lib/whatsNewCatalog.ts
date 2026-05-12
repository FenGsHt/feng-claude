/** [2026-05-08] 发版时在对应版本下补充要点；无条目时用 fallbackWhatsNewCopy */

export interface WhatsNewCopy {
  titleZh: string
  titleEn: string
  bulletsZh: string[]
  bulletsEn: string[]
}

const ENTRIES: Record<string, WhatsNewCopy> = {
  '0.7.3': {
    titleZh: 'Feng Claude 0.7.3 更新摘要',
    titleEn: "What's new in Feng Claude 0.7.3",
    bulletsZh: [
      '外嵌多行输入：正文与回车分两帧发送，修复斜杠 TUI 下多行内容无法提交的问题',
      'PTY 发送带回传 ACK（可选 traceId），便于确认内容是否写入终端',
      '斜杠命令识别收紧；以 /** 开头的多行不再误判为命令',
      '斜杠交互仅保留「中断」，去掉单独的「强制退出」',
      '完整变更见 CHANGELOG / README 致谢中的上游项目说明'
    ],
    bulletsEn: [
      'Embed multiline: body and Enter sent in two steps so slash TUIs submit reliably',
      'PTY send acknowledgment (optional traceId) to verify input reached the terminal',
      'Stricter slash-command detection; multiline blocks starting with /** are not treated as commands',
      'Slash TUI: single Interrupt action; removed separate force-exit control',
      'See CHANGELOG; README lists upstream projects we build on'
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

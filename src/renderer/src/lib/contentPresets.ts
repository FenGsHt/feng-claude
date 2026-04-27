/**
 * 预设内容库 - 确保即使 API 失败也有内容可用
 */

export type ContentCategory = 'chitchat' | 'joke' | 'news' | 'tip'

export const PRESET_CHITCHATS: string[] = [
  "你在看什么代码？让我也瞅瞅~",
  "今天写了多少行代码？不多的话...我来帮你凑数",
  "这个函数好像有点长，要不要重构一下？",
  "要不要我帮你 debug？虽然我只会盯着看...",
  "我觉得这个变量命名有点...算了我不说了",
  "你最近是不是熬夜写代码了？要注意休息哦",
  "这个项目看起来挺有趣的，是做什么的？",
  "看你忙了半天了，要不要休息一下？",
  "我有种预感，这段代码后面会有 bug...",
  "说真的，你写的代码还是挺不错的~",
]

export const PRESET_JOKES: string[] = [
  "为什么程序员分不清 Halloween 和 Christmas？因为 Oct 31 == Dec 25",
  "有一个程序员去买菜，老婆说买一个西瓜，如果有西红柿就买两个。结果他买了两个西瓜。",
  "Java 程序员的墓碑上写什么？`System.exit(0)`",
  "程序员最讨厌康熙的哪个儿子？胤禩，因为他是八阿哥（bug）",
  "为什么程序员喜欢用深色主题？因为 bug 在浅色主题下更容易被发现",
  "一个 SQL 语句走进酒吧，看到两张表，问：我能 JOIN 你们吗？",
  "C++ 程序员自杀前会写什么？`delete this;`",
  "程序员的三大谎言：这段代码不用测试、这个 bug 很容易修、明天就上线",
  "前端工程师最怕什么？后端说接口改了",
  "Git 是什么？Git 就是可以让你把代码搞丢还能找回来的魔法",
]

export const PRESET_TIPS: string[] = [
  "Tip: git stash 临时保存工作进度，方便切换分支",
  "Tip: Ctrl+R 在终端里反向搜索历史命令",
  "Tip: git log --oneline --graph 可视化分支历史",
  "Tip: 用 jq 命令在终端里处理 JSON 数据",
  "Tip: docker ps -a 查看所有容器（包括停止的）",
  "Tip: npm outdated 查看哪些依赖需要更新",
  "Tip: 用 tldr 替代 man，获取简化的命令说明",
  "Tip: git diff --stat 快速查看改动文件统计",
  "Tip: Ctrl+L 清屏比 clear 更快",
  "Tip: 用 explainshell.com 解释复杂命令",
]

export const PRESET_NEWS: string[] = [
  "听说 Claude 4.7 出了，比前代更聪明了",
  "最近 AI 编程助手越来越强了，你用的哪个？",
  "GitHub Copilot 好像又进化了",
  "前端圈最近在讨论什么新框架？",
  "Rust 据说越来越火了，你学了吗？",
  "听说 TypeScript 5.x 有新特性了",
  "云原生好像很火，Kubernetes 你会用吗？",
  "微服务架构据说很复杂，你们项目用的什么架构？",
  "据说 AI 能写代码了，要不要让 AI 帮你写？",
  "最近 DevOps 很流行，CI/CD 你们用的哪个？",
]

export const ALL_PRESETS: Record<ContentCategory, string[]> = {
  chitchat: PRESET_CHITCHATS,
  joke: PRESET_JOKES,
  tip: PRESET_TIPS,
  news: PRESET_NEWS,
}
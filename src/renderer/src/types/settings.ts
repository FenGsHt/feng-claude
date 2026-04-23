export interface ClaudeSettings {
  authToken: string
  baseUrl: string
  model: string
  sonnetModel: string
  haikuModel: string
  opusModel: string
  subagentModel: string
  disableExperimentalBetas: boolean
}

export const DEFAULT_SETTINGS: ClaudeSettings = {
  authToken: '',
  baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
  model: 'glm-5',
  sonnetModel: 'glm-5',
  haikuModel: 'glm-5',
  opusModel: 'glm-5',
  subagentModel: 'glm-5',
  disableExperimentalBetas: true
}

/**
 * 双引擎语音识别服务
 * - webSpeech: 浏览器内置 Web Speech API（流式，需联网）
 * - whisper:   MediaRecorder 录音 → POST Whisper-compatible API（录完再转写）
 */

export type SpeechEngine = 'webSpeech' | 'whisper'
export type SpeechLanguage = 'zh-CN' | 'en-US' | 'auto'

export interface SpeechConfig {
  engine: SpeechEngine
  language: SpeechLanguage
  whisperEndpoint: string
  whisperToken: string
  whisperModel: string
}

export interface SpeechCallbacks {
  /** 识别中的临时结果（仅 webSpeech 有） */
  onInterim?: (text: string) => void
  /** 最终确认的文字 */
  onResult: (text: string) => void
  onError?: (msg: string) => void
  onStart?: () => void
  onStop?: () => void
}

// ── Web Speech API 引擎 ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

let webSpeechInstance: AnySpeechRecognition | null = null

function startWebSpeech(config: SpeechConfig, cb: SpeechCallbacks): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition

  if (!SpeechRecognitionCtor) {
    cb.onError?.('当前环境不支持 Web Speech API')
    return
  }

  stopWebSpeech()

  const rec: AnySpeechRecognition = new SpeechRecognitionCtor()
  rec.continuous = false
  rec.interimResults = true
  rec.lang = config.language === 'auto' ? '' : config.language
  rec.maxAlternatives = 1

  rec.onstart = () => cb.onStart?.()
  rec.onend = () => cb.onStop?.()
  rec.onerror = (e: { error: string }) => cb.onError?.(e.error)

  rec.onresult = (e: { results: { isFinal: boolean; [i: number]: { transcript: string } }[]; resultIndex: number }) => {
    let interim = ''
    let final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) final += t
      else interim += t
    }
    if (interim) cb.onInterim?.(interim)
    if (final) cb.onResult(final)
  }

  webSpeechInstance = rec
  rec.start()
}

function stopWebSpeech(): void {
  if (webSpeechInstance) {
    webSpeechInstance.stop()
    webSpeechInstance = null
  }
}

// ── Whisper API 引擎 ──────────────────────────────────────────────────────────

let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let mediaStream: MediaStream | null = null

function startWhisper(config: SpeechConfig, cb: SpeechCallbacks): void {
  stopWhisper()
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      mediaStream = stream
      audioChunks = []
      mediaRecorder = new MediaRecorder(stream)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        cb.onStop?.()
        const blob = new Blob(audioChunks, { type: 'audio/webm' })
        audioChunks = []
        try {
          const text = await transcribeWithWhisper(blob, config)
          if (text) cb.onResult(text)
        } catch (e) {
          cb.onError?.(String(e))
        }
      }

      mediaRecorder.start()
      cb.onStart?.()
    })
    .catch((e) => cb.onError?.(String(e)))
}

function stopWhisper(): void {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null
  mediaRecorder = null
}

async function transcribeWithWhisper(blob: Blob, config: SpeechConfig): Promise<string> {
  const endpoint = config.whisperEndpoint || 'https://api.openai.com'
  const url = `${endpoint.replace(/\/$/, '')}/v1/audio/transcriptions`

  const form = new FormData()
  form.append('file', blob, 'audio.webm')
  form.append('model', config.whisperModel || 'whisper-1')
  if (config.language !== 'auto') {
    form.append('language', config.language.split('-')[0]) // 'zh-CN' → 'zh'
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whisperToken}` },
    body: form,
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Whisper API ${resp.status}: ${err}`)
  }

  const json = await resp.json() as { text?: string }
  return json.text?.trim() ?? ''
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

export function startRecognition(config: SpeechConfig, cb: SpeechCallbacks): void {
  if (config.engine === 'whisper') {
    startWhisper(config, cb)
  } else {
    startWebSpeech(config, cb)
  }
}

export function stopRecognition(engine: SpeechEngine): void {
  if (engine === 'whisper') {
    stopWhisper()
  } else {
    stopWebSpeech()
  }
}

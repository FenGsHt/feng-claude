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
  micDeviceId?: string
  whisperPrompt?: string
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
  rec.onerror = (e: { error: string }) => {
    const msgs: Record<string, string> = {
      'network': 'Web Speech API 需要连接 Google 服务，在 Electron 中不可用，请在设置中改用 Whisper 引擎',
      'not-allowed': '麦克风权限被拒绝，请检查系统设置',
      'audio-capture': '无法访问麦克风，请确认设备已连接',
      'no-speech': '未检测到语音输入',
      'service-not-allowed': '语音服务不可用',
    }
    cb.onError?.(msgs[e.error] ?? e.error)
  }

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
let peakRms = 0
let analyserRaf = 0

// 最低有效音量阈值（0-1），低于此值认为是背景噪音
const MIN_RMS_THRESHOLD = 0.02

function startWhisper(config: SpeechConfig, cb: SpeechCallbacks): void {
  stopWhisper()
  navigator.mediaDevices
    .getUserMedia({ audio: config.micDeviceId ? { deviceId: { exact: config.micDeviceId } } : true })
    .then((stream) => {
      mediaStream = stream
      audioChunks = []
      peakRms = 0

      // 用 AnalyserNode 实时测量录音音量
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      const measureRms = (): void => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        const rms = Math.sqrt(sum / buf.length)
        if (rms > peakRms) peakRms = rms
        analyserRaf = requestAnimationFrame(measureRms)
      }
      analyserRaf = requestAnimationFrame(measureRms)

      mediaRecorder = new MediaRecorder(stream)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        cancelAnimationFrame(analyserRaf)
        audioCtx.close()
        cb.onStop?.()
        const blob = new Blob(audioChunks, { type: 'audio/webm' })
        audioChunks = []
        console.log('[whisper] peak RMS:', peakRms.toFixed(4), '/ threshold:', MIN_RMS_THRESHOLD)
        if (peakRms < MIN_RMS_THRESHOLD) {
          console.log('[whisper] 音量过低，跳过转写（背景噪音）')
          return
        }
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
  form.append('response_format', 'verbose_json')
  if (config.language !== 'auto') {
    form.append('language', config.language.split('-')[0]) // 'zh-CN' → 'zh'
  }
  if (config.whisperPrompt) {
    form.append('prompt', config.whisperPrompt)
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

  type Segment = { no_speech_prob: number; text: string }
  const json = await resp.json() as { text?: string; segments?: Segment[] }

  console.log('[whisper] raw response:', JSON.stringify(json, null, 2))

  // 用 no_speech_prob 过滤幻觉：segments 全部超过阈值则视为静音
  const NO_SPEECH_THRESHOLD = 0.6
  if (json.segments && json.segments.length > 0) {
    console.log('[whisper] segments no_speech_prob:', json.segments.map(s => `${s.no_speech_prob.toFixed(3)} "${s.text}"`))
    const validText = json.segments
      .filter(s => s.no_speech_prob < NO_SPEECH_THRESHOLD)
      .map(s => s.text)
      .join('')
      .trim()
    console.log('[whisper] filtered result:', JSON.stringify(validText))
    return validText
  }

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

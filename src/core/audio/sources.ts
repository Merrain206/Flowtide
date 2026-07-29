/**
 * 程序化音源生成器 —— 每个变体返回一条接入 destination 的音频链
 *
 * 全部基于噪声源 + 滤波 + LFO 调制合成，无任何素材文件。
 * 返回的 stop() 负责断开并释放本链所有节点。
 *
 * v0.6 听感升级（参考 Audiokinetic 雨声合成方法论 + 噪声色彩研究）：
 *   1. 棕噪(Brown)打底 —— 低频温暖，远比白噪柔和耐听
 *   2. 立体声噪声 buffer —— 左右声道独立采样，空间感立现
 *   3. 雨声分层：低频雨幕 + 中频沸腾感 + 随机雨滴颗粒
 *   4. 所有链路经 envelope 淡入淡出，杜绝切换爆音
 */

export interface SourceChain {
  stop: () => void
}

type NoiseColor = 'white' | 'pink' | 'brown'

/** 创建立体声循环噪声源（左右声道独立生成，带来空间宽度） */
function createNoiseSource(ctx: AudioContext, color: NoiseColor): AudioBufferSourceNode {
  const seconds = 4
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    fillNoise(data, color)
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function fillNoise(data: Float32Array, color: NoiseColor) {
  if (color === 'white') {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  } else if (color === 'brown') {
    // 布朗运动积分：深沉温暖的"远方隆隆"感
    let last = 0
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      data[i] = last * 3.5
    }
  } else {
    // Paul Kellet 粉噪近似
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  }
}

/** LFO 调制某个 AudioParam（用于风声起伏、咖啡馆嘈杂波动） */
function createLfo(
  ctx: AudioContext,
  target: AudioParam,
  frequency: number,
  depth: number,
): { osc: OscillatorNode; gain: GainNode } {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = frequency
  const gain = ctx.createGain()
  gain.gain.value = depth
  osc.connect(gain)
  gain.connect(target)
  osc.start()
  return { osc, gain }
}

/**
 * 淡入包络 —— 所有链路统一经此接入输出，1.2s 缓升；
 * release() 快速淡出后再由调用方延迟拆链，避免爆音
 */
function createEnv(ctx: AudioContext, out: GainNode): { env: GainNode; release: () => void } {
  const env = ctx.createGain()
  env.gain.value = 0
  env.gain.setTargetAtTime(1, ctx.currentTime, 0.4)
  env.connect(out)
  return {
    env,
    release: () => env.gain.setTargetAtTime(0, ctx.currentTime, 0.06),
  }
}

/** 拆链延迟：等淡出完成再 disconnect */
const TEARDOWN_MS = 250

/**
 * 雨声（三层合成）：
 *   ① 低频雨幕 —— 棕噪低通，远处的连绵背景
 *   ② 中频沸腾 —— 粉噪带通，雨点密集打落的"沙沙"质感
 *   ③ 雨滴颗粒 —— 随机调度的短促水滴 ping，左右声道随机散布
 */
function buildRain(ctx: AudioContext, out: GainNode): SourceChain {
  const { env, release } = createEnv(ctx, out)

  // ① 低频雨幕
  const rumble = createNoiseSource(ctx, 'brown')
  const rumbleLp = ctx.createBiquadFilter()
  rumbleLp.type = 'lowpass'
  rumbleLp.frequency.value = 900
  const rumbleGain = ctx.createGain()
  rumbleGain.gain.value = 0.55
  rumble.connect(rumbleLp).connect(rumbleGain).connect(env)
  rumble.start()

  // ② 中频沸腾感
  const boil = createNoiseSource(ctx, 'pink')
  const boilBp = ctx.createBiquadFilter()
  boilBp.type = 'bandpass'
  boilBp.frequency.value = 1600
  boilBp.Q.value = 0.4
  const boilGain = ctx.createGain()
  boilGain.gain.value = 0.5
  boil.connect(boilBp).connect(boilGain).connect(env)
  boil.start()

  // ③ 随机雨滴颗粒
  let dropTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const scheduleDrop = () => {
    if (stopped) return
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 900 + Math.random() * 2200
    const g = ctx.createGain()
    const peak = 0.02 + Math.random() * 0.05
    const now = ctx.currentTime
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(peak, now + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.05)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    osc.connect(g).connect(pan).connect(env)
    osc.start(now)
    osc.stop(now + 0.15)
    osc.onended = () => { osc.disconnect(); g.disconnect(); pan.disconnect() }
    dropTimer = setTimeout(scheduleDrop, 60 + Math.random() * 240)
  }
  scheduleDrop()

  return {
    stop: () => {
      stopped = true
      if (dropTimer) clearTimeout(dropTimer)
      release()
      setTimeout(() => {
        rumble.stop(); boil.stop()
        rumble.disconnect(); rumbleLp.disconnect(); rumbleGain.disconnect()
        boil.disconnect(); boilBp.disconnect(); boilGain.disconnect()
        env.disconnect()
      }, TEARDOWN_MS)
    },
  }
}

/**
 * 溪流：棕噪温暖底 + 双带通"水光闪动"层
 * 两个带通中心频率由不同速率 LFO 独立游走，模拟水流的不规则反光感
 */
function buildStream(ctx: AudioContext, out: GainNode): SourceChain {
  const { env, release } = createEnv(ctx, out)

  // 温暖水底
  const bed = createNoiseSource(ctx, 'brown')
  const bedLp = ctx.createBiquadFilter()
  bedLp.type = 'lowpass'
  bedLp.frequency.value = 1200
  const bedGain = ctx.createGain()
  bedGain.gain.value = 0.5
  bed.connect(bedLp).connect(bedGain).connect(env)
  bed.start()

  // 水光层 ×2（不同频率、不同 LFO 速率）
  const spark = createNoiseSource(ctx, 'pink')
  const bp1 = ctx.createBiquadFilter()
  bp1.type = 'bandpass'
  bp1.frequency.value = 1400
  bp1.Q.value = 1.2
  const bp2 = ctx.createBiquadFilter()
  bp2.type = 'bandpass'
  bp2.frequency.value = 2600
  bp2.Q.value = 1.5
  const sparkGain = ctx.createGain()
  sparkGain.gain.value = 0.35
  const lfo1 = createLfo(ctx, bp1.frequency, 0.4, 350)
  const lfo2 = createLfo(ctx, bp2.frequency, 0.23, 600)
  spark.connect(bp1).connect(sparkGain)
  spark.connect(bp2).connect(sparkGain)
  sparkGain.connect(env)
  spark.start()

  return {
    stop: () => {
      release()
      setTimeout(() => {
        bed.stop(); spark.stop()
        lfo1.osc.stop(); lfo2.osc.stop()
        bed.disconnect(); bedLp.disconnect(); bedGain.disconnect()
        spark.disconnect(); bp1.disconnect(); bp2.disconnect(); sparkGain.disconnect()
        lfo1.gain.disconnect(); lfo2.gain.disconnect()
        env.disconnect()
      }, TEARDOWN_MS)
    },
  }
}

/** 暖噪：棕噪 + 柔和低通（取代刺耳纯白噪，温暖如远方瀑布） */
function buildWhite(ctx: AudioContext, out: GainNode): SourceChain {
  const { env, release } = createEnv(ctx, out)
  const src = createNoiseSource(ctx, 'brown')
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 2500
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 45
  const trim = ctx.createGain()
  trim.gain.value = 0.8
  src.connect(highpass).connect(lowpass).connect(trim).connect(env)
  src.start()
  return {
    stop: () => {
      release()
      setTimeout(() => {
        src.stop()
        src.disconnect(); highpass.disconnect(); lowpass.disconnect(); trim.disconnect()
        env.disconnect()
      }, TEARDOWN_MS)
    },
  }
}

/**
 * 风声：棕噪 + 共振带通游走（阵风呼啸感）+ 慢速强弱起伏
 * 共振峰频率漂移 = 风"掠过"的方向感
 */
function buildWind(ctx: AudioContext, out: GainNode): SourceChain {
  const { env, release } = createEnv(ctx, out)
  const src = createNoiseSource(ctx, 'brown')
  const body = ctx.createBiquadFilter()
  body.type = 'lowpass'
  body.frequency.value = 500
  // 呼啸共振峰
  const whistle = ctx.createBiquadFilter()
  whistle.type = 'bandpass'
  whistle.frequency.value = 400
  whistle.Q.value = 4
  const whistleGain = ctx.createGain()
  whistleGain.gain.value = 0.4
  const swell = ctx.createGain()
  swell.gain.value = 0.7
  // 三个不同速率的 LFO：风向游走 + 阵风起伏 + 呼啸频率漂移
  const freqLfo = createLfo(ctx, body.frequency, 0.11, 200)
  const gainLfo = createLfo(ctx, swell.gain, 0.07, 0.28)
  const whistleLfo = createLfo(ctx, whistle.frequency, 0.05, 180)
  src.connect(body).connect(swell)
  src.connect(whistle).connect(whistleGain).connect(swell)
  swell.connect(env)
  src.start()
  return {
    stop: () => {
      release()
      setTimeout(() => {
        src.stop()
        freqLfo.osc.stop(); gainLfo.osc.stop(); whistleLfo.osc.stop()
        src.disconnect(); body.disconnect(); whistle.disconnect(); whistleGain.disconnect(); swell.disconnect()
        freqLfo.gain.disconnect(); gainLfo.gain.disconnect(); whistleLfo.gain.disconnect()
        env.disconnect()
      }, TEARDOWN_MS)
    },
  }
}

/** 咖啡馆低语感：暖底 + 中频人声轮廓带通 + 三重不规则波动 */
function buildCafe(ctx: AudioContext, out: GainNode): SourceChain {
  const { env, release } = createEnv(ctx, out)
  // 空间暖底（房间的"存在感"）
  const room = createNoiseSource(ctx, 'brown')
  const roomLp = ctx.createBiquadFilter()
  roomLp.type = 'lowpass'
  roomLp.frequency.value = 350
  const roomGain = ctx.createGain()
  roomGain.gain.value = 0.35
  room.connect(roomLp).connect(roomGain).connect(env)
  room.start()

  // 人声低语轮廓
  const voice = createNoiseSource(ctx, 'pink')
  const voiceBp = ctx.createBiquadFilter()
  voiceBp.type = 'bandpass'
  voiceBp.frequency.value = 800
  voiceBp.Q.value = 1.0
  const murmur = ctx.createGain()
  murmur.gain.value = 0.7
  // 三个互质速率 LFO 叠加 → 接近人群噪声的不规则波动
  const lfo1 = createLfo(ctx, murmur.gain, 0.31, 0.15)
  const lfo2 = createLfo(ctx, murmur.gain, 0.07, 0.12)
  const lfo3 = createLfo(ctx, voiceBp.frequency, 0.13, 150)
  voice.connect(voiceBp).connect(murmur).connect(env)
  voice.start()

  return {
    stop: () => {
      release()
      setTimeout(() => {
        room.stop(); voice.stop()
        lfo1.osc.stop(); lfo2.osc.stop(); lfo3.osc.stop()
        room.disconnect(); roomLp.disconnect(); roomGain.disconnect()
        voice.disconnect(); voiceBp.disconnect(); murmur.disconnect()
        lfo1.gain.disconnect(); lfo2.gain.disconnect(); lfo3.gain.disconnect()
        env.disconnect()
      }, TEARDOWN_MS)
    },
  }
}

/**
 * 律动层：双正弦微差拍（binaural-beat 风格）
 * 升级：音量减半 + 慢速呼吸式起伏 + 轻微失谐第二泛音，摆脱"电流嗡嗡"感
 */
function buildPulse(ctx: AudioContext, out: GainNode, baseFreq: number, beatHz: number): SourceChain {
  const { env, release } = createEnv(ctx, out)
  const oscA = ctx.createOscillator()
  const oscB = ctx.createOscillator()
  oscA.type = 'sine'
  oscB.type = 'sine'
  oscA.frequency.value = baseFreq
  oscB.frequency.value = baseFreq + beatHz
  // 柔化泛音：高八度极低音量正弦，让音色不那么"实验室"
  const oscC = ctx.createOscillator()
  oscC.type = 'sine'
  oscC.frequency.value = baseFreq * 2 + 1
  const cGain = ctx.createGain()
  cGain.gain.value = 0.08
  const mix = ctx.createGain()
  mix.gain.value = 0.3
  // 呼吸式起伏（约 12s 一个循环，接近放松呼吸节奏）
  const breathe = createLfo(ctx, mix.gain, 0.085, 0.1)
  oscA.connect(mix)
  oscB.connect(mix)
  oscC.connect(cGain).connect(mix)
  mix.connect(env)
  oscA.start(); oscB.start(); oscC.start()
  return {
    stop: () => {
      release()
      setTimeout(() => {
        oscA.stop(); oscB.stop(); oscC.stop(); breathe.osc.stop()
        oscA.disconnect(); oscB.disconnect(); oscC.disconnect(); cGain.disconnect()
        mix.disconnect(); breathe.gain.disconnect()
        env.disconnect()
      }, TEARDOWN_MS)
    },
  }
}

/** 变体名 → 构建函数 */
export function buildSource(ctx: AudioContext, out: GainNode, variant: string): SourceChain | null {
  switch (variant) {
    case 'rain': return buildRain(ctx, out)
    case 'stream': return buildStream(ctx, out)
    case 'white': return buildWhite(ctx, out)
    case 'wind': return buildWind(ctx, out)
    case 'cafe': return buildCafe(ctx, out)
    case 'deep': return buildPulse(ctx, out, 80, 4)   // θ 波差拍，深度专注
    case 'soft': return buildPulse(ctx, out, 160, 8)  // α 波差拍，放松
    case 'off':
    default:
      return null
  }
}

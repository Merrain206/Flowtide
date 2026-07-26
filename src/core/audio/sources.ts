/**
 * 程序化音源生成器 —— 每个变体返回一条接入 destination 的音频链
 *
 * 全部基于噪声源 + 滤波 + LFO 调制合成，无任何素材文件。
 * 返回的 stop() 负责断开并释放本链所有节点。
 */

export interface SourceChain {
  stop: () => void
}

/** 创建一段循环播放的噪声 buffer（含粉噪/白噪） */
function createNoiseSource(ctx: AudioContext, type: 'white' | 'pink'): AudioBufferSourceNode {
  const seconds = 4
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  if (type === 'white') {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
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
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
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

/** 雨声：粉噪 + 高通去闷 + 轻微高频衰减 */
function buildRain(ctx: AudioContext, out: GainNode): SourceChain {
  const src = createNoiseSource(ctx, 'pink')
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 400
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 7000
  src.connect(highpass).connect(lowpass).connect(out)
  src.start()
  return {
    stop: () => {
      src.stop()
      src.disconnect()
      highpass.disconnect()
      lowpass.disconnect()
    },
  }
}

/** 溪流：白噪 + 带通 + 快速 LFO 让水流"闪动" */
function buildStream(ctx: AudioContext, out: GainNode): SourceChain {
  const src = createNoiseSource(ctx, 'white')
  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 1800
  bandpass.Q.value = 0.7
  const lfo = createLfo(ctx, bandpass.frequency, 0.6, 500)
  src.connect(bandpass).connect(out)
  src.start()
  return {
    stop: () => {
      src.stop()
      lfo.osc.stop()
      src.disconnect()
      bandpass.disconnect()
      lfo.gain.disconnect()
    },
  }
}

/** 纯白噪 */
function buildWhite(ctx: AudioContext, out: GainNode): SourceChain {
  const src = createNoiseSource(ctx, 'white')
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 9000
  src.connect(lowpass).connect(out)
  src.start()
  return {
    stop: () => {
      src.stop()
      src.disconnect()
      lowpass.disconnect()
    },
  }
}

/** 风声：粉噪 + 低通 + 慢速 LFO 起伏 */
function buildWind(ctx: AudioContext, out: GainNode): SourceChain {
  const src = createNoiseSource(ctx, 'pink')
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 600
  const swell = ctx.createGain()
  swell.gain.value = 0.7
  const freqLfo = createLfo(ctx, lowpass.frequency, 0.13, 250)
  const gainLfo = createLfo(ctx, swell.gain, 0.09, 0.25)
  src.connect(lowpass).connect(swell).connect(out)
  src.start()
  return {
    stop: () => {
      src.stop()
      freqLfo.osc.stop()
      gainLfo.osc.stop()
      src.disconnect()
      lowpass.disconnect()
      swell.disconnect()
      freqLfo.gain.disconnect()
      gainLfo.gain.disconnect()
    },
  }
}

/** 咖啡馆低语感：中频带通粉噪 + 不规则波动，模拟人声嘈杂的"轮廓" */
function buildCafe(ctx: AudioContext, out: GainNode): SourceChain {
  const src = createNoiseSource(ctx, 'pink')
  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 900
  bandpass.Q.value = 1.2
  const murmur = ctx.createGain()
  murmur.gain.value = 0.8
  // 两个不同频率的 LFO 叠加，波动更接近人群噪声的不规则感
  const lfo1 = createLfo(ctx, murmur.gain, 0.31, 0.18)
  const lfo2 = createLfo(ctx, murmur.gain, 0.07, 0.12)
  src.connect(bandpass).connect(murmur).connect(out)
  src.start()
  return {
    stop: () => {
      src.stop()
      lfo1.osc.stop()
      lfo2.osc.stop()
      src.disconnect()
      bandpass.disconnect()
      murmur.disconnect()
      lfo1.gain.disconnect()
      lfo2.gain.disconnect()
    },
  }
}

/** 律动层：双正弦微差拍（binaural-beat 风格的柔和嗡鸣） */
function buildPulse(ctx: AudioContext, out: GainNode, baseFreq: number, beatHz: number): SourceChain {
  const oscA = ctx.createOscillator()
  const oscB = ctx.createOscillator()
  oscA.type = 'sine'
  oscB.type = 'sine'
  oscA.frequency.value = baseFreq
  oscB.frequency.value = baseFreq + beatHz
  const mix = ctx.createGain()
  mix.gain.value = 0.5
  oscA.connect(mix)
  oscB.connect(mix)
  mix.connect(out)
  oscA.start()
  oscB.start()
  return {
    stop: () => {
      oscA.stop()
      oscB.stop()
      oscA.disconnect()
      oscB.disconnect()
      mix.disconnect()
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

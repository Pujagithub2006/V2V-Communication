// Audio recording & encoding utilities for V2V voice communication

export async function startMicCapture() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true }
  });

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(2048, 1, 1);
  const chunks = [];

  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return { stream, ctx, source, processor, chunks };
}

export function stopMicCapture({ stream, ctx, source, processor, chunks }) {
  processor.disconnect();
  processor.onaudioprocess = null;
  source.disconnect();
  stream.getTracks().forEach(t => t.stop());

  if (chunks.length === 0) return null;

  // Merge chunks
  const totalLen = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Float32Array(totalLen);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }

  // Downsample to 16kHz
  const origRate = ctx.sampleRate || 44100;
  const targetRate = 16000;
  const downsampled = downsample(merged, origRate, targetRate);

  ctx.close();
  return encodeWAV(downsampled, targetRate);
}

function downsample(buffer, fromRate, toRate) {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const start = Math.round(i * ratio);
    const end = Math.round((i + 1) * ratio);
    let sum = 0, count = 0;
    for (let j = start; j < end && j < buffer.length; j++) { sum += buffer[j]; count++; }
    result[i] = count > 0 ? sum / count : 0;
  }
  return result;
}

function encodeWAV(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([v], { type: 'audio/wav' });
}

export function playRawAudio(arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const raw = new Int16Array(arrayBuffer);
      const audioBuffer = ctx.createBuffer(1, raw.length, 16000);
      const channel = audioBuffer.getChannelData(0);
      for (let i = 0; i < raw.length; i++) channel[i] = raw[i] / 32768.0;
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ctx.destination);
      src.onended = () => { ctx.close(); resolve(); };
      src.start(0);
    } catch (e) { reject(e); }
  });
}

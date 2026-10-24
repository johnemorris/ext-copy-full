/**
 * Camera shutter audio synthesis using Web Audio API (zero external assets)
 */
export function playCameraShutterSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;

    // First click: mechanical click (high pass noise burst)
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2800, now);
    filter.Q.setValueAtTime(3, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Second click: mirror reflex click after 60ms
    const noise2 = ctx.createBufferSource();
    noise2.buffer = buffer;

    const filter2 = ctx.createBiquadFilter();
    filter2.type = 'highpass';
    filter2.frequency.setValueAtTime(1400, now + 0.07);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.4, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    noise2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(ctx.destination);
    noise2.start(now + 0.07);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

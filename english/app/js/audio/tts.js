let cachedVoice = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = ['Samantha', 'Google US English', 'Karen', 'Moira', 'Ava'];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  return voices.find(v => v.lang === 'en-US') || voices[0];
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.8; u.pitch = 1.2;
  if (cachedVoice) u.voice = cachedVoice;
  window.speechSynthesis.speak(u);
}

if ('speechSynthesis' in window) {
  cachedVoice = pickVoice();
  speechSynthesis.onvoiceschanged = () => { cachedVoice = pickVoice(); };
}

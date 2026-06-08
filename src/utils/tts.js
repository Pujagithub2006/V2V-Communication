// Text-to-Speech utility for V2V status announcements

let speaking = false;

export function speak(text) {
  if (!('speechSynthesis' in window)) return;

  // Cancel any ongoing speech to avoid queue buildup
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Try to pick a clear English voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0];
  if (preferred) utterance.voice = preferred;

  utterance.onstart = () => { speaking = true; };
  utterance.onend = () => { speaking = false; };
  utterance.onerror = () => { speaking = false; };

  window.speechSynthesis.speak(utterance);
}

export function isSpeaking() {
  return speaking;
}

// Preload voices (some browsers load them async)
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

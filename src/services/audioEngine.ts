let sharedAudioContext: AudioContext | null = null;

export const getVoiceAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioCtor =
    window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioCtor();
  }
  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
};

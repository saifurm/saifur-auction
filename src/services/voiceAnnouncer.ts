import { getVoiceAudioContext } from "./audioEngine";

const VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID || "NihRgaLj2HWAjvZ5XNxl";
const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const MODEL_ID = "eleven_monolingual_v1";

const audioCache = new Map<string, AudioBuffer>();

const fetchAnnouncementBuffer = async (text: string): Promise<AudioBuffer | null> => {
  const ctx = getVoiceAudioContext();
  if (!ctx || !API_KEY) {
    return null;
  }
  const cacheKey = `${VOICE_ID}:${text}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.9,
        style: 0.25,
        use_speaker_boost: true
      }
    })
  });
  if (!response.ok) {
    return null;
  }
  const arrayBuffer = await response.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  audioCache.set(cacheKey, decoded);
  return decoded;
};

export const playAnnouncement = async (text: string) => {
  if (!text.trim()) return;
  const ctx = getVoiceAudioContext();
  if (!ctx || !API_KEY) return;
  const buffer = await fetchAnnouncementBuffer(text);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 1.05;
  source.buffer = buffer;
  source.connect(gain).connect(ctx.destination);
  source.start();
};

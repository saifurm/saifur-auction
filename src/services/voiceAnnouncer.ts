export const audioAnnounce = async (
  text: string,
  AudioContext: typeof window.AudioContext
): Promise<void> => {
  try {
    // Call our Netlify serverless function instead of ElevenLabs directly
    const response = await fetch("/.netlify/functions/announce", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Audio announcement failed:", error);
      return;
    }

    // Get the base64 audio from the response
    const base64Audio = await response.text();
    
    // Convert base64 to blob
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: "audio/mpeg" });
    
    // Create audio URL and play
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    await audio.play();
    
    // Clean up
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
  } catch (error) {
    console.error("Error in audio announcement:", error);
  }
};
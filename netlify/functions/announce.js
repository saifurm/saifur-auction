exports.handler = async (event) => {
  try {
    const { ELEVENLABS_API_KEY, VOICE_ID } = process.env;
    if (!ELEVENLABS_API_KEY || !VOICE_ID) {
      return {
        statusCode: 500,
        body: "Missing ELEVENLABS_API_KEY or VOICE_ID",
      };
    }

    const { text } = JSON.parse(event.body);

    if (!text) {
      return {
        statusCode: 400,
        body: "Text is required",
      };
    }

    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
        }),
      }
    );

    if (!elRes.ok) {
      const error = await elRes.text();
      return {
        statusCode: elRes.status,
        body: error,
      };
    }

    const audioBuffer = Buffer.from(await elRes.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
      },
      body: audioBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: err.toString(),
    };
  }
};

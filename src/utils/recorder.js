// Microphone capture for local speech-to-text. Audio goes only to the Keystone backend (local Whisper):
// the browser's Web Speech API is not used because Chrome sends that audio to Google.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(resolve => {
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
    };
  });
  rec.start();
  return { stop: () => { rec.stop(); return done; } };
}

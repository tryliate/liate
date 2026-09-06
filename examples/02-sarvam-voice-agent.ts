import { LiateVoice, LiateToken } from '../src';

/**
 * Example 02: Indic Voice Agent (Sarvam AI Saaras STT + Bulbul TTS)
 * 
 * Run with:
 *   bun run examples/02-sarvam-voice-agent.ts
 */
async function main() {
  console.log('🎙️ Initializing Indic Voice Engine (LiateVoice)...\n');

  const voice = new LiateVoice({
    language: 'hi-IN', // Hindi (also supports ta-IN, te-IN, bn-IN, mr-IN, gu-IN, kn-IN, ml-IN, pa-IN, or-IN, en-IN)
    speaker: 'meera'
  });

  // Calculate real INR cost for 15 minutes of speech recognition
  const sttCost = LiateToken.calculateSpeechToTextCost(15 * 60, false);
  console.log(`[Cost Est] 15 mins STT: ${sttCost.formattedINR} (Sarvam ₹30/hour rate)`);

  // Calculate real INR cost for synthesizing 2,500 characters
  const ttsCost = LiateToken.calculateTextToSpeechCost(2500);
  console.log(`[Cost Est] 2,500 chars TTS: ${ttsCost.formattedINR} (Sarvam ₹3/1K chars rate)`);

  // Listen to real-time audio chunk events
  voice.on('audio', (chunk: Buffer) => {
    console.log(`[Audio Stream] Received audio packet (${chunk.length} bytes)`);
  });

  console.log('\n✅ Voice configuration ready for Indic speech pipeline.');
}

main().catch(console.error);

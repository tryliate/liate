import { LiateAgent } from '../Liate_Pillars/LiateAgent';
import { LiateKey } from '../Liate_Data/LiateKey';
import { LiateError } from '../Liate_Security/LiateError';
import { EventEmitter } from 'node:events';

/**
 * [41] - LiateVoice (Sovereign Indic Multilingual Voice & Audio Streaming Engine)
 * 
 * Provides native Speech-to-Text (STT) and Text-to-Speech (TTS) for 10+ Indic languages
 * (Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Gujarati, Odia, Punjabi, Indian English).
 * Powers real-time full-duplex conversational voice agents.
 */

export type IndicLanguageCode =
  | 'hi-IN' // Hindi
  | 'ta-IN' // Tamil
  | 'te-IN' // Telugu
  | 'mr-IN' // Marathi
  | 'bn-IN' // Bengali
  | 'kn-IN' // Kannada
  | 'ml-IN' // Malayalam
  | 'gu-IN' // Gujarati
  | 'pa-IN' // Punjabi
  | 'or-IN' // Odia
  | 'en-IN'; // Indian English

export interface VoiceOptions {
  language?: IndicLanguageCode;
  speaker?: string; // e.g. 'ananya', 'aravind', 'isha', 'kavya'
  model?: string;   // e.g. 'sarvam/bulbul:v1'
  sampleRate?: number; // Default 16000
  pitch?: number;   // 0.5 to 1.5
  pace?: number;    // 0.5 to 1.5
  apiKey?: string;
}

export interface TranscriptionResult {
  text: string;
  language: IndicLanguageCode;
  confidence: number;
  durationSeconds?: number;
}

export interface SynthesisResult {
  audioBase64: string;
  format: 'wav' | 'mp3' | 'pcm';
  sampleRate: number;
  durationSeconds: number;
  text: string;
  language: IndicLanguageCode;
}

export interface VoiceTurnResult {
  userInputText: string;
  agentResponseText: string;
  synthesizedAudio: SynthesisResult;
  executionTimeMs: number;
}

export class LiateVoice extends EventEmitter {
  public language: IndicLanguageCode;
  public speaker: string;
  public model: string;
  public options: VoiceOptions;

  constructor(options: VoiceOptions = {}) {
    super();
    this.language = options.language || 'hi-IN';
    this.speaker = options.speaker || 'ananya';
    this.model = options.model || 'sarvam/bulbul:v1';
    this.options = options;
  }

  /**
   * Transcribe raw audio buffer or Base64 audio into Indic text via Sarvam Saaras STT API
   */
  public async speechToText(
    audioInput: Buffer | string,
    language?: IndicLanguageCode
  ): Promise<TranscriptionResult> {
    const lang = language || this.language;
    const apiKey = this.options.apiKey || LiateKey.current('sarvam');

    if (!apiKey) {
      throw new Error(
        '[LiateVoice] speechToText requires a Sarvam API key.\n' +
        'Set SARVAM_API_KEY in your .env file or pass apiKey in VoiceOptions.\n' +
        'Get your key at: https://sarvam.ai'
      );
    }

    this.emit('stt_start', { language: lang });

    const audioBase64 = Buffer.isBuffer(audioInput)
      ? audioInput.toString('base64')
      : audioInput;

    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio: audioBase64,
        language_code: lang,
        model: 'saaras:v2'
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`[LiateVoice] Sarvam STT API error (${res.status}): ${errText}`);
    }

    const data = await res.json() as any;
    const result: TranscriptionResult = {
      text: data.transcript || data.text || '',
      language: lang,
      confidence: data.confidence ?? 0.95,
      durationSeconds: data.duration_seconds ?? 0
    };

    this.emit('stt_complete', result);
    return result;
  }

  /**
   * Synthesize text into high-fidelity Indic spoken voice audio via Sarvam Bulbul TTS API
   */
  public async textToSpeech(
    text: string,
    options: Partial<VoiceOptions> = {}
  ): Promise<SynthesisResult> {
    const lang = options.language || this.language;
    const speaker = options.speaker || this.speaker;
    const apiKey = options.apiKey || this.options.apiKey || LiateKey.current('sarvam');

    if (!apiKey) {
      throw new Error(
        '[LiateVoice] textToSpeech requires a Sarvam API key.\n' +
        'Set SARVAM_API_KEY in your .env file or pass apiKey in VoiceOptions.\n' +
        'Get your key at: https://sarvam.ai'
      );
    }

    this.emit('tts_start', { text, language: lang, speaker });

    const sampleRate = options.sampleRate || 16000;

    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        target_language_code: lang,
        speaker,
        model: options.model || this.model || 'bulbul:v1',
        speech_sample_rate: sampleRate,
        enable_preprocessing: true
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`[LiateVoice] Sarvam TTS API error (${res.status}): ${errText}`);
    }

    const data = await res.json() as any;
    const audioBase64: string = data.audios?.[0] ?? data.audio ?? '';
    const duration = Math.max(1, text.length * 0.06);

    const result: SynthesisResult = {
      audioBase64,
      format: 'wav',
      sampleRate,
      durationSeconds: duration,
      text,
      language: lang
    };

    this.emit('tts_complete', result);
    return result;
  }

  /**
   * End-to-end full duplex voice turn: Audio -> STT -> Agent ReAct Loop -> TTS Audio Response
   */
  public async processVoiceTurn(
    audioInput: Buffer | string, 
    agent: LiateAgent
  ): Promise<VoiceTurnResult> {
    const startTime = Date.now();

    // 1. Transcribe speech to text
    const stt = await this.speechToText(audioInput);
    this.emit('transcribed', stt.text);

    // 2. Run agent ReAct loop
    const rawResult = await agent.run(stt.text);
    const agentText = (typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult))
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();

    this.emit('agent_answered', agentText);

    // 3. Synthesize agent response back to voice audio
    const tts = await this.textToSpeech(agentText);

    return {
      userInputText: stt.text,
      agentResponseText: agentText,
      synthesizedAudio: tts,
      executionTimeMs: Date.now() - startTime
    };
  }

  /**
   * Convert into an autonomous Voice Generation tool for any LiateAgent
   */
  public toTool() {
    return {
      name: 'synthesize_speech_audio',
      description: 'Synthesizes text into spoken voice audio in Indian languages (Hindi, Tamil, Telugu, Marathi, etc.)',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text message to speak out loud' },
          language: { 
            type: 'string', 
            enum: ['hi-IN', 'ta-IN', 'te-IN', 'mr-IN', 'bn-IN', 'kn-IN', 'ml-IN', 'gu-IN', 'en-IN'],
            description: 'The target Indic language code'
          }
        },
        required: ['text']
      },
      execute: async (args: { text: string; language?: IndicLanguageCode }) => {
        const audio = await this.textToSpeech(args.text, { language: args.language });
        return {
          status: 'AUDIO_GENERATED',
          format: audio.format,
          durationSeconds: audio.durationSeconds,
          language: audio.language
        };
      }
    };
  }
}

export const Voice = LiateVoice;

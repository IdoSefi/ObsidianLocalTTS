export type TtsBackend = 'kokoro' | 'piper';

export interface LocalTtsSettings {
  serverUrl: string;
  backend: TtsBackend;
  kokoroVoice: string;
  piperVoice: string;
  speed: number;
}

export interface SentenceChunk {
  id: number;
  text: string;
  from: number;
  to: number;
}

export interface SynthesisRequest {
  sessionId: string;
  sentenceId: number;
  backend: TtsBackend;
  text: string;
  voice: string;
  speed: number;
  outputDir: string;
}

export interface SynthesisResponse {
  sessionId: string;
  sentenceId: number;
  ok: boolean;
  audioPath?: string;
  audioBase64?: string;
  error?: string;
}

export interface CacheManifest {
  filePath: string;
  backend: TtsBackend;
  sentenceCount: number;
  generatedAt: string;
  documentHash: string;
  sentenceHashes: string[];
}

export type AudioState = "idle" | "generating" | "ready" | "error";

export interface SentenceChunk {
  id: number;
  text: string;
  spokenText?: string;
  from: number;
  to: number;
  audioPath?: string;
  audioUrl?: string;
  audioState: AudioState;
}

export interface CachedSentenceAudio {
  sentenceId: number;
  audioVaultPath: string;
  audioPath: string;
}

export interface NoteSynthesisManifest {
  notePath: string;
  sentenceCount: number;
  generatedAt: string;
  noteTextHash: string;
  sentenceTextHashes: string[];
  sentenceTexts?: string[];
}

export interface PluginSettings {
  serverUrl: string;
  voice: string;
  speed: number;
}

export interface SynthesisRequest {
  sessionId: string;
  sentenceId: number;
  text: string;
  voice: string;
  speed: number;
  outputDir: string;
}

export interface SynthesisResponse {
  sessionId: string;
  sentenceId: number;
  audioPath?: string;
  ok: boolean;
  error?: string;
}

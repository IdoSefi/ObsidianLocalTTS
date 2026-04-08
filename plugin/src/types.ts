export type AudioState = "idle" | "generating" | "ready" | "error";

export interface SentenceChunk {
  id: number;
  text: string;
  from: number;
  to: number;
  audioPath?: string;
  audioUrl?: string;
  audioState: AudioState;
}

export interface PluginSettings {
  serverUrl: string;
  voice: string;
  speed: number;
  clearStaleCacheOnStartup: boolean;
}

export interface SynthesisRequest {
  sessionId: string;
  sentenceId: number;
  text: string;
  voice: string;
  speed: number;
}

export interface SynthesisResponse {
  sessionId: string;
  sentenceId: number;
  audioPath?: string;
  ok: boolean;
  error?: string;
}

import { normalizePath, Notice } from "obsidian";

const CACHE_ROOT = ".obsidian/plugins/obsidian-kokoro-tts/temp";

export class TempAudioCache {
  private sessionId: string | null = null;

  startSession(): string {
    this.sessionId = `session-${Date.now()}`;
    return this.sessionId;
  }

  getSessionId(): string {
    if (!this.sessionId) {
      return this.startSession();
    }
    return this.sessionId;
  }

  getSessionFolder(): string {
    return normalizePath(`${CACHE_ROOT}/${this.getSessionId()}`);
  }

  async cleanupCurrentSession(): Promise<void> {
    // Placeholder. Codex should implement actual temp-file deletion.
    new Notice("TODO: cleanup current Kokoro TTS temp session");
  }

  async cleanupStaleSessions(): Promise<void> {
    // Placeholder. Codex should implement stale temp cleanup.
  }
}

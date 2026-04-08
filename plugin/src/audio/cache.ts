import { Notice } from "obsidian";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CACHE_ROOT = join(tmpdir(), "obsidian-kokoro-tts");
const STALE_MAX_AGE_MS = 1000 * 60 * 60 * 24;

export class TempAudioCache {
  private sessionId: string | null = null;

  async startSession(): Promise<string> {
    this.sessionId = `session-${Date.now()}`;
    const sessionFolder = join(CACHE_ROOT, this.sessionId);
    await fs.mkdir(sessionFolder, { recursive: true });
    return this.sessionId;
  }

  getSessionId(): string {
    if (!this.sessionId) {
      throw new Error("No active Kokoro TTS session");
    }
    return this.sessionId;
  }

  getSessionFolder(): string {
    return join(CACHE_ROOT, this.getSessionId());
  }

  async cleanupCurrentSession(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    const sessionFolder = this.getSessionFolder();
    await fs.rm(sessionFolder, { recursive: true, force: true });
    this.sessionId = null;
  }

  async cleanupStaleSessions(): Promise<void> {
    await fs.mkdir(CACHE_ROOT, { recursive: true });
    const entries = await fs.readdir(CACHE_ROOT, { withFileTypes: true });
    const now = Date.now();
    let deleted = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("session-")) {
        continue;
      }

      const folderPath = join(CACHE_ROOT, entry.name);
      const stat = await fs.stat(folderPath);
      const age = now - stat.mtimeMs;
      if (age <= STALE_MAX_AGE_MS) {
        continue;
      }

      await fs.rm(folderPath, { recursive: true, force: true });
      deleted += 1;
    }

    if (deleted > 0) {
      new Notice(`Cleaned ${deleted} stale Kokoro TTS cache session(s)`);
    }
  }
}

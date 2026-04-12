import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CacheManifest, SentenceChunk, TtsBackend } from '../types';

const ROOT = 'audio_synthesis';
const MANIFEST = 'manifest.json';

export interface CacheLocation {
  key: string;
  folder: string;
}

export class CacheManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getStorageRoot(): Promise<string> {
    const base = this.context.workspaceStorageUri ?? this.context.globalStorageUri;
    await fs.mkdir(base.fsPath, { recursive: true });
    const full = path.join(base.fsPath, ROOT);
    await fs.mkdir(full, { recursive: true });
    return full;
  }

  async getCacheLocation(filePath: string, backend: TtsBackend): Promise<CacheLocation> {
    const root = await this.getStorageRoot();
    const key = getFileKey(filePath, backend);
    const folder = path.join(root, key);
    await fs.mkdir(folder, { recursive: true });
    return { key, folder };
  }



  async createTempSynthesisDir(filePath: string, backend: TtsBackend): Promise<string> {
    const key = getFileKey(filePath, backend);
    const root = path.join(os.tmpdir(), 'local-tts-vscode', key);
    await fs.mkdir(root, { recursive: true });
    return fs.mkdtemp(path.join(root, 'run-'));
  }

  async removeTempSynthesisDir(tempDir: string): Promise<void> {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  sentenceWavPath(folder: string, sentenceId: number): string {
    return path.join(folder, `sentence-${String(sentenceId + 1).padStart(4, '0')}.wav`);
  }

  manifestPath(folder: string): string {
    return path.join(folder, MANIFEST);
  }

  async clearFolder(folder: string): Promise<void> {
    await fs.rm(folder, { recursive: true, force: true });
    await fs.mkdir(folder, { recursive: true });
  }

  async readManifest(folder: string): Promise<CacheManifest | null> {
    try {
      const raw = await fs.readFile(this.manifestPath(folder), 'utf-8');
      return JSON.parse(raw) as CacheManifest;
    } catch {
      return null;
    }
  }

  async writeManifest(folder: string, manifest: CacheManifest): Promise<void> {
    await fs.writeFile(this.manifestPath(folder), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  async isCacheValid(folder: string, filePath: string, backend: TtsBackend, sentences: SentenceChunk[], text: string): Promise<boolean> {
    const manifest = await this.readManifest(folder);
    if (!manifest) {
      return false;
    }

    if (manifest.filePath !== filePath || manifest.backend !== backend || manifest.sentenceCount !== sentences.length) {
      return false;
    }

    const docHash = hash(text);
    if (manifest.documentHash !== docHash) {
      return false;
    }

    const sentenceHashes = sentences.map((sentence) => hash(sentence.text));
    if (sentenceHashes.some((value, index) => manifest.sentenceHashes[index] !== value)) {
      return false;
    }

    for (const sentence of sentences) {
      try {
        await fs.access(this.sentenceWavPath(folder, sentence.id));
      } catch {
        return false;
      }
    }

    return true;
  }
}

export function buildManifest(filePath: string, backend: TtsBackend, sentences: SentenceChunk[], text: string): CacheManifest {
  return {
    filePath,
    backend,
    sentenceCount: sentences.length,
    generatedAt: new Date().toISOString(),
    documentHash: hash(text),
    sentenceHashes: sentences.map((sentence) => hash(sentence.text)),
  };
}

function getFileKey(filePath: string, backend: TtsBackend): string {
  const base = path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'file';
  return `${base}-${backend}-${hash(filePath).slice(0, 8)}`;
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

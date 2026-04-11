import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { App, FileSystemAdapter, normalizePath } from "obsidian";
import type { CachedSentenceAudio, NoteSynthesisManifest, TtsBackend } from "../types";

const ROOT_FOLDER = "audio_synthesis";
const MANIFEST_FILE = "manifest.json";
const SENTENCE_FILE_REGEX = /^sentence-(\d+)\.wav$/i;
const STAGING_ROOT = join(tmpdir(), "obsidian-local-tts-staging");

export interface PrepareNoteFolderResult {
  noteFolderPath: string;
  absoluteFolderPath: string;
}

export interface ExistingSentenceAudioResult {
  noteFolderPath: string;
  files: CachedSentenceAudio[];
  manifest: NoteSynthesisManifest | null;
}

export class VaultAudioCache {
  constructor(private readonly app: App) {}

  getNoteSynthesisFolder(notePath: string, backend: TtsBackend): string {
    const safeFolderName = this.getSafeNoteFolderName(notePath, backend);
    return normalizePath(`${ROOT_FOLDER}/${safeFolderName}`);
  }

  async prepareNoteSynthesisFolder(
    notePath: string,
    backend: TtsBackend,
    replaceExisting: boolean,
  ): Promise<PrepareNoteFolderResult> {
    await this.ensureFolderExists(ROOT_FOLDER);

    const noteFolderPath = this.getNoteSynthesisFolder(notePath, backend);
    if (replaceExisting && (await this.app.vault.adapter.exists(noteFolderPath))) {
      await this.app.vault.adapter.rmdir(noteFolderPath, true);
    }

    await this.ensureFolderExists(noteFolderPath);
    return {
      noteFolderPath,
      absoluteFolderPath: this.getAbsolutePathForVaultPath(noteFolderPath),
    };
  }

  async prepareTempSynthesisFolder(notePath: string, backend: TtsBackend, replaceExisting: boolean): Promise<string> {
    const tempFolder = this.getTempSynthesisFolder(notePath, backend);
    if (replaceExisting) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
    await fs.mkdir(tempFolder, { recursive: true });
    return tempFolder;
  }

  async clearTempSynthesisFolder(notePath: string, backend: TtsBackend): Promise<void> {
    await fs.rm(this.getTempSynthesisFolder(notePath, backend), { recursive: true, force: true });
  }

  getSentenceAudioVaultPath(notePath: string, backend: TtsBackend, sentenceId: number): string {
    const noteFolder = this.getNoteSynthesisFolder(notePath, backend);
    const oneBased = sentenceId + 1;
    return normalizePath(`${noteFolder}/sentence-${String(oneBased).padStart(4, "0")}.wav`);
  }

  getSentenceAudioAbsolutePath(notePath: string, backend: TtsBackend, sentenceId: number): string {
    return this.getAbsolutePathForVaultPath(this.getSentenceAudioVaultPath(notePath, backend, sentenceId));
  }

  getAbsolutePathForVaultPath(vaultPath: string): string {
    return this.toAbsolutePath(vaultPath);
  }

  async listExistingSentenceAudio(notePath: string, backend: TtsBackend): Promise<ExistingSentenceAudioResult> {
    const noteFolderPath = this.getNoteSynthesisFolder(notePath, backend);
    const exists = await this.app.vault.adapter.exists(noteFolderPath);
    if (!exists) {
      return {
        noteFolderPath,
        files: [],
        manifest: null,
      };
    }

    const listResult = await this.app.vault.adapter.list(noteFolderPath);
    const files: CachedSentenceAudio[] = listResult.files
      .map((vaultPath) => {
        const filename = vaultPath.split("/").pop() ?? "";
        const match = filename.match(SENTENCE_FILE_REGEX);
        if (!match) {
          return null;
        }
        const sentenceId = Number(match[1]) - 1;
        if (!Number.isInteger(sentenceId) || sentenceId < 0) {
          return null;
        }
        return {
          sentenceId,
          audioVaultPath: vaultPath,
          audioPath: this.toAbsolutePath(vaultPath),
        };
      })
      .filter((file): file is CachedSentenceAudio => file !== null)
      .sort((a, b) => a.sentenceId - b.sentenceId);

    const manifest = await this.readManifest(notePath, backend);

    return {
      noteFolderPath,
      files,
      manifest,
    };
  }

  async clearNoteSynthesis(notePath: string, backend: TtsBackend): Promise<void> {
    const folder = this.getNoteSynthesisFolder(notePath, backend);
    if (!(await this.app.vault.adapter.exists(folder))) {
      return;
    }
    await this.app.vault.adapter.rmdir(folder, true);
  }

  async writeManifest(notePath: string, backend: TtsBackend, manifest: NoteSynthesisManifest): Promise<void> {
    const manifestPath = normalizePath(`${this.getNoteSynthesisFolder(notePath, backend)}/${MANIFEST_FILE}`);
    await this.app.vault.adapter.write(manifestPath, JSON.stringify(manifest, null, 2));
  }

  async readManifest(notePath: string, backend: TtsBackend): Promise<NoteSynthesisManifest | null> {
    const manifestPath = normalizePath(`${this.getNoteSynthesisFolder(notePath, backend)}/${MANIFEST_FILE}`);
    if (!(await this.app.vault.adapter.exists(manifestPath))) {
      return null;
    }

    try {
      const raw = await this.app.vault.adapter.read(manifestPath);
      return JSON.parse(raw) as NoteSynthesisManifest;
    } catch {
      return null;
    }
  }

  private getTempSynthesisFolder(notePath: string, backend: TtsBackend): string {
    return join(STAGING_ROOT, this.getSafeNoteFolderName(notePath, backend));
  }

  private async ensureFolderExists(folder: string): Promise<void> {
    if (await this.app.vault.adapter.exists(folder)) {
      return;
    }
    await this.app.vault.adapter.mkdir(folder);
  }

  private getSafeNoteFolderName(notePath: string, backend: TtsBackend): string {
    const normalizedPath = normalizePath(notePath);
    const filename = basename(normalizedPath, extname(normalizedPath)) || "note";
    const sanitizedBase = sanitizeForWindows(filename).slice(0, 40) || "note";
    const hash = hashString(normalizedPath);
    return `${sanitizedBase}-${hash}-${backend}`;
  }

  private toAbsolutePath(vaultPath: string): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("Persistent note synthesis requires FileSystemAdapter on desktop");
    }

    return join(adapter.getBasePath(), vaultPath);
  }
}

function sanitizeForWindows(input: string): string {
  const replaced = input
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[.\s]+$/g, "")
    .trim();

  return replaced || "note";
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { LocalTtsClient } from '../audio/localTtsClient';
import { PlaybackPanel } from '../audio/playbackPanel';
import { buildManifest, CacheManager } from '../cache/cacheManager';
import { findSentenceByOffset, splitIntoSentences } from '../sentence/splitter';
import { getActiveVoice, getSettings } from '../settings';
import type { SentenceChunk } from '../types';

const ALLOWED_LANGS = new Set(['markdown', 'plaintext']);

export class TtsController {
  private readonly clientFor = () => new LocalTtsClient(getSettings().serverUrl);
  private readonly cache: CacheManager;
  private readonly player: PlaybackPanel;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.cache = new CacheManager(context);
    this.player = new PlaybackPanel(context);
  }

  async synthesizeActiveFile(): Promise<void> {
    const docCtx = this.getActiveDoc();
    if (!docCtx) {
      return;
    }

    const { doc, text, sentences } = docCtx;
    const settings = getSettings();
    const { folder } = await this.cache.getCacheLocation(doc.uri.fsPath, settings.backend);
    await this.cache.clearFolder(folder);

    await this.synthesizeSentences(doc.uri.fsPath, text, sentences, folder);
    vscode.window.showInformationMessage(`Local TTS: synthesized ${sentences.length} sentence(s).`);
  }

  async playFromCache(): Promise<void> {
    const docCtx = this.getActiveDoc();
    if (!docCtx) {
      return;
    }

    const { doc, text, sentences } = docCtx;
    const settings = getSettings();
    const { folder } = await this.cache.getCacheLocation(doc.uri.fsPath, settings.backend);

    const valid = await this.cache.isCacheValid(folder, doc.uri.fsPath, settings.backend, sentences, text);
    if (!valid) {
      vscode.window.showInformationMessage('Local TTS: cache missing or stale, synthesizing active file first...');
      await this.cache.clearFolder(folder);
      await this.synthesizeSentences(doc.uri.fsPath, text, sentences, folder);
    }

    await this.playSentences(folder, sentences, 0);
  }

  async startFromCursor(): Promise<void> {
    const docCtx = this.getActiveDoc();
    if (!docCtx) {
      return;
    }

    const { editor, doc, text, sentences } = docCtx;
    const sentence = findSentenceByOffset(sentences, doc.offsetAt(editor.selection.active));
    if (!sentence) {
      vscode.window.showWarningMessage('Local TTS: cursor is not inside a sentence.');
      return;
    }

    const settings = getSettings();
    const { folder } = await this.cache.getCacheLocation(doc.uri.fsPath, settings.backend);
    const valid = await this.cache.isCacheValid(folder, doc.uri.fsPath, settings.backend, sentences, text);
    if (!valid) {
      vscode.window.showInformationMessage('Local TTS: cache missing or stale, synthesizing active file first...');
      await this.cache.clearFolder(folder);
      await this.synthesizeSentences(doc.uri.fsPath, text, sentences, folder);
    }

    await this.playSentences(folder, sentences, sentence.id);
  }

  pauseResume(): void {
    this.player.pauseResume();
  }

  stop(): void {
    this.player.stop();
  }

  private getActiveDoc(): { editor: vscode.TextEditor; doc: vscode.TextDocument; text: string; sentences: SentenceChunk[] } | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Local TTS: open a text editor first.');
      return null;
    }

    const doc = editor.document;
    if (!ALLOWED_LANGS.has(doc.languageId)) {
      vscode.window.showWarningMessage('Local TTS: only Markdown and plain text are supported in v1.');
      return null;
    }

    const text = doc.getText();
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) {
      vscode.window.showWarningMessage('Local TTS: no readable sentences found.');
      return null;
    }

    return { editor, doc, text, sentences };
  }

  private async synthesizeSentences(filePath: string, text: string, sentences: SentenceChunk[], folder: string): Promise<void> {
    const settings = getSettings();
    const client = this.clientFor();
    const voice = getActiveVoice(settings);
    const sessionId = randomUUID();
    const tempDir = await this.cache.createTempSynthesisDir(filePath, settings.backend);

    await client.health();

    try {
      for (const sentence of sentences) {
        const response = await client.synthesize({
          sessionId,
          sentenceId: sentence.id,
          backend: settings.backend,
          text: sentence.text,
          voice,
          speed: settings.speed,
          outputDir: tempDir,
        });

        if (!response.ok || !response.audioPath) {
          throw new Error(response.error ?? `Synthesis failed for sentence ${sentence.id + 1}`);
        }

        await fs.copyFile(response.audioPath, this.cache.sentenceWavPath(folder, sentence.id));
      }

      await this.cache.writeManifest(folder, buildManifest(filePath, settings.backend, sentences, text));
    } finally {
      await this.cache.removeTempSynthesisDir(tempDir);
    }
  }

  private async playSentences(folder: string, sentences: SentenceChunk[], startId: number): Promise<void> {
    const items = sentences.map((sentence) => ({ sentenceId: sentence.id, wavPath: path.join(folder, `sentence-${String(sentence.id + 1).padStart(4, '0')}.wav`) }));
    await this.player.playQueue(items, startId);
  }
}

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
  private readonly logPrefix = '[controller]';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {
    this.cache = new CacheManager(context);
    this.player = new PlaybackPanel(context, output);
  }

  async synthesizeActiveFile(): Promise<void> {
    const docCtx = this.getActiveDoc();
    if (!docCtx) {
      return;
    }

    const { doc, text, sentences } = docCtx;
    this.log(`synthesizeActiveFile file=${doc.uri.fsPath} sentences=${sentences.length}`);
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
    this.log(`playFromCache file=${doc.uri.fsPath} sentences=${sentences.length}`);
    const settings = getSettings();
    const { folder } = await this.cache.getCacheLocation(doc.uri.fsPath, settings.backend);

    this.log(`cache folder=${folder} backend=${settings.backend}`);
    const valid = await this.cache.isCacheValid(folder, doc.uri.fsPath, settings.backend, sentences, text);
    this.log(`cache valid=${valid}`);
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
    this.log(`startFromCursor file=${doc.uri.fsPath} cursorOffset=${doc.offsetAt(editor.selection.active)} sentences=${sentences.length}`);
    const sentence = findSentenceByOffset(sentences, doc.offsetAt(editor.selection.active));
    if (!sentence) {
      vscode.window.showWarningMessage('Local TTS: cursor is not inside a sentence.');
      return;
    }

    const settings = getSettings();
    const { folder } = await this.cache.getCacheLocation(doc.uri.fsPath, settings.backend);
    this.log(`cache folder=${folder} backend=${settings.backend}`);
    const valid = await this.cache.isCacheValid(folder, doc.uri.fsPath, settings.backend, sentences, text);
    this.log(`cache valid=${valid}`);
    if (!valid) {
      vscode.window.showInformationMessage('Local TTS: cache missing or stale, synthesizing active file first...');
      await this.cache.clearFolder(folder);
      await this.synthesizeSentences(doc.uri.fsPath, text, sentences, folder);
    }

    await this.playSentences(folder, sentences, sentence.id);
  }

  pauseResume(): void {
    this.log(`pauseResume requested state=${this.player.getState()}`);
    this.player.pauseResume();
  }

  stop(): void {
    this.log('stop requested');
    this.player.stop();
  }

  private getActiveDoc(): { editor: vscode.TextEditor; doc: vscode.TextDocument; text: string; sentences: SentenceChunk[] } | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Local TTS: open a text editor first.');
      this.log('no active editor');
      return null;
    }

    const doc = editor.document;
    if (!ALLOWED_LANGS.has(doc.languageId)) {
      vscode.window.showWarningMessage('Local TTS: only Markdown and plain text are supported in v1.');
      this.log(`unsupported languageId=${doc.languageId}`);
      return null;
    }

    const text = doc.getText();
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) {
      vscode.window.showWarningMessage('Local TTS: no readable sentences found.');
      this.log('no sentences extracted');
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
    this.log(`synthesize sessionId=${sessionId} backend=${settings.backend} voice=${voice} speed=${settings.speed} tempDir=${tempDir}`);

    await client.health();
    this.log(`health check ok server=${settings.serverUrl}`);

    try {
      for (const sentence of sentences) {
        this.log(`synth sentence=${sentence.id + 1}/${sentences.length} chars=${sentence.text.length}`);
        const response = await client.synthesize({
          sessionId,
          sentenceId: sentence.id,
          backend: settings.backend,
          text: sentence.text,
          voice,
          speed: settings.speed,
          outputDir: tempDir,
        });

        if (!response.ok) {
          this.log(`synth failed sentence=${sentence.id + 1} error=${response.error ?? 'unknown'}`);
          throw new Error(response.error ?? `Synthesis failed for sentence ${sentence.id + 1}`);
        }

        const cachePath = this.cache.sentenceWavPath(folder, sentence.id);
        if (response.audioBase64) {
          this.log(`synth sentence=${sentence.id + 1} payload=audioBase64 bytes~= ${(response.audioBase64.length * 3) / 4}`);
          await fs.writeFile(cachePath, Buffer.from(response.audioBase64, 'base64'));
        } else if (response.audioPath) {
          this.log(`synth sentence=${sentence.id + 1} payload=audioPath path=${response.audioPath}`);
          await fs.copyFile(response.audioPath, cachePath);
        } else {
          throw new Error(`Synthesis returned no audio payload for sentence ${sentence.id + 1}`);
        }
      }

      await this.cache.writeManifest(folder, buildManifest(filePath, settings.backend, sentences, text));
      this.log(`manifest written folder=${folder}`);
    } finally {
      await this.cache.removeTempSynthesisDir(tempDir);
      this.log(`tempDir removed ${tempDir}`);
    }
  }

  private async playSentences(folder: string, sentences: SentenceChunk[], startId: number): Promise<void> {
    const items = sentences.map((sentence) => ({ sentenceId: sentence.id, wavPath: path.join(folder, `sentence-${String(sentence.id + 1).padStart(4, '0')}.wav`) }));
    this.log(`playSentences startId=${startId} queue=${items.length}`);
    await this.player.playQueue(items, startId);
  }

  private log(message: string): void {
    this.output.appendLine(`${this.logPrefix} ${message}`);
  }
}

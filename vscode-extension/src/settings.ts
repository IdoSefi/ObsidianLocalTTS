import * as vscode from 'vscode';
import type { LocalTtsSettings, TtsBackend } from './types';

const SECTION = 'localTts';

export const DEFAULT_SETTINGS: LocalTtsSettings = {
  serverUrl: 'http://127.0.0.1:8765',
  backend: 'kokoro',
  kokoroVoice: 'af_bella',
  piperVoice: 'en_US-lessac-high',
  speed: 1.0,
};

export function getSettings(): LocalTtsSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    serverUrl: config.get<string>('serverUrl', DEFAULT_SETTINGS.serverUrl),
    backend: config.get<TtsBackend>('backend', DEFAULT_SETTINGS.backend),
    kokoroVoice: config.get<string>('kokoroVoice', DEFAULT_SETTINGS.kokoroVoice),
    piperVoice: config.get<string>('piperVoice', DEFAULT_SETTINGS.piperVoice),
    speed: config.get<number>('speed', DEFAULT_SETTINGS.speed),
  };
}

export function getActiveVoice(settings: LocalTtsSettings): string {
  return settings.backend === 'kokoro' ? settings.kokoroVoice : settings.piperVoice;
}

export async function setBackend(backend: TtsBackend): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update('backend', backend, vscode.ConfigurationTarget.Global);
}

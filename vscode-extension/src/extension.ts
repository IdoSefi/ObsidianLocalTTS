import * as vscode from 'vscode';
import { TtsController } from './controller/ttsController';
import { setBackend } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new TtsController(context);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = '$(unmute) Local TTS';
  status.tooltip = 'Local TTS commands are available in the Command Palette';
  status.show();

  context.subscriptions.push(
    status,
    vscode.commands.registerCommand('localTts.synthesizeActiveFile', async () => controller.synthesizeActiveFile()),
    vscode.commands.registerCommand('localTts.playActiveFileFromCache', async () => controller.playFromCache()),
    vscode.commands.registerCommand('localTts.pauseResume', () => controller.pauseResume()),
    vscode.commands.registerCommand('localTts.stop', () => controller.stop()),
    vscode.commands.registerCommand('localTts.startFromCursor', async () => controller.startFromCursor()),
    vscode.commands.registerCommand('localTts.useKokoroBackend', async () => {
      await setBackend('kokoro');
      vscode.window.showInformationMessage('Local TTS backend set to Kokoro.');
    }),
    vscode.commands.registerCommand('localTts.usePiperBackend', async () => {
      await setBackend('piper');
      vscode.window.showInformationMessage('Local TTS backend set to Piper (en_US-lessac-high).');
    }),
  );
}

export function deactivate(): void {}

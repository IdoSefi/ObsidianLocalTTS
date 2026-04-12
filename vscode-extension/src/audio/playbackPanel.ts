import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

interface QueueItem {
  sentenceId: number;
  wavPath: string;
}

type PlaybackState = 'idle' | 'playing' | 'paused';

export class PlaybackPanel {
  private panel: vscode.WebviewPanel;
  private state: PlaybackState = 'idle';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {
    this.panel = vscode.window.createWebviewPanel('localTtsPlayer', 'Local TTS Player', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panel.webview.html = getWebviewHtml();
    this.panel.onDidDispose(() => {
      this.state = 'idle';
      this.output.appendLine('[playback] panel disposed');
    });
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'state') {
        this.state = msg.value as PlaybackState;
        this.output.appendLine(`[playback] state=${this.state}`);
      }
      if (msg?.type === 'log') {
        this.output.appendLine(`[webview] ${String(msg.message ?? '')}`);
      }
      if (msg?.type === 'error') {
        const errorMessage = String(msg.message ?? 'Unknown playback error');
        this.output.appendLine(`[webview:error] ${errorMessage}`);
        void vscode.window.showWarningMessage(`Local TTS playback error: ${errorMessage}`);
      }
    });
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  async playQueue(items: QueueItem[], startSentenceId: number): Promise<void> {
    this.output.appendLine(`[playback] preparing queue size=${items.length}, startSentenceId=${startSentenceId}`);
    const payload = await Promise.all(
      items.map(async (item) => {
        const buf = await fs.readFile(item.wavPath);
        this.output.appendLine(`[playback] loaded wav sentenceId=${item.sentenceId} bytes=${buf.byteLength} path=${item.wavPath}`);
        return {
          sentenceId: item.sentenceId,
          dataUrl: `data:audio/wav;base64,${buf.toString('base64')}`,
        };
      }),
    );

    this.reveal();
    this.panel.webview.postMessage({ type: 'playQueue', items: payload, startSentenceId });
  }

  pauseResume(): void {
    this.output.appendLine('[playback] pauseResume command');
    this.panel.webview.postMessage({ type: 'pauseResume' });
  }

  stop(): void {
    this.output.appendLine('[playback] stop command');
    this.panel.webview.postMessage({ type: 'stop' });
    this.state = 'idle';
  }

  getState(): PlaybackState {
    return this.state;
  }
}

function getWebviewHtml(): string {
  return `<!doctype html>
<html>
  <body>
    <h3>Local TTS Player</h3>
    <div id="status">Idle</div>
    <script>
      const vscode = acquireVsCodeApi();
      let queue = [];
      let index = -1;
      let audio = null;
      let state = 'idle';

      const log = (message) => vscode.postMessage({ type: 'log', message });
      const reportError = (message) => vscode.postMessage({ type: 'error', message });

      const statusEl = document.getElementById('status');
      const setState = (next) => {
        state = next;
        statusEl.textContent = next;
        vscode.postMessage({ type: 'state', value: next });
      };

      const playAt = (targetIndex) => {
        if (targetIndex < 0 || targetIndex >= queue.length) {
          log('playAt reached end of queue');
          setState('idle');
          return;
        }
        index = targetIndex;
        if (audio) {
          audio.pause();
        }
        log('playAt index=' + targetIndex + ' sentenceId=' + queue[index].sentenceId);
        audio = new Audio(queue[index].dataUrl);
        audio.onended = () => {
          log('ended sentenceId=' + queue[index].sentenceId);
          playAt(index + 1);
        };
        audio.onerror = () => {
          reportError('audio.onerror at sentenceId=' + (queue[index]?.sentenceId ?? 'unknown'));
          setState('idle');
        };
        audio.play().then(() => {
          log('play started sentenceId=' + queue[index].sentenceId);
          setState('playing');
        }).catch((error) => {
          reportError('audio.play rejected: ' + (error?.message ?? error));
          setState('idle');
        });
      };

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'playQueue') {
          queue = msg.items || [];
          log('received queue length=' + queue.length);
          const startIdx = Math.max(0, queue.findIndex((item) => item.sentenceId === msg.startSentenceId));
          log('computed startIdx=' + startIdx + ' requestedSentenceId=' + msg.startSentenceId);
          playAt(startIdx);
        }

        if (msg.type === 'pauseResume') {
          if (!audio) {
            log('pauseResume ignored because no active audio');
            return;
          }
          if (state === 'playing') {
            audio.pause();
            log('audio paused');
            setState('paused');
          } else if (state === 'paused') {
            audio.play().then(() => {
              log('audio resumed');
              setState('playing');
            }).catch((error) => {
              reportError('resume rejected: ' + (error?.message ?? error));
              setState('idle');
            });
          }
        }

        if (msg.type === 'stop') {
          if (audio) {
            audio.pause();
            audio = null;
          }
          index = -1;
          queue = [];
          log('stop received; queue cleared');
          setState('idle');
        }
      });
    </script>
  </body>
</html>`;
}

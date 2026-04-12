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

  constructor(private readonly context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel('localTtsPlayer', 'Local TTS Player', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panel.webview.html = getWebviewHtml();
    this.panel.onDidDispose(() => {
      this.state = 'idle';
    });
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'state') {
        this.state = msg.value as PlaybackState;
      }
    });
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  async playQueue(items: QueueItem[], startSentenceId: number): Promise<void> {
    const payload = await Promise.all(
      items.map(async (item) => {
        const buf = await fs.readFile(item.wavPath);
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
    this.panel.webview.postMessage({ type: 'pauseResume' });
  }

  stop(): void {
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

      const statusEl = document.getElementById('status');
      const setState = (next) => {
        state = next;
        statusEl.textContent = next;
        vscode.postMessage({ type: 'state', value: next });
      };

      const playAt = (targetIndex) => {
        if (targetIndex < 0 || targetIndex >= queue.length) {
          setState('idle');
          return;
        }
        index = targetIndex;
        if (audio) {
          audio.pause();
        }
        audio = new Audio(queue[index].dataUrl);
        audio.onended = () => playAt(index + 1);
        audio.onerror = () => setState('idle');
        audio.play().then(() => setState('playing')).catch(() => setState('idle'));
      };

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'playQueue') {
          queue = msg.items || [];
          const startIdx = Math.max(0, queue.findIndex((item) => item.sentenceId === msg.startSentenceId));
          playAt(startIdx);
        }

        if (msg.type === 'pauseResume') {
          if (!audio) {
            return;
          }
          if (state === 'playing') {
            audio.pause();
            setState('paused');
          } else if (state === 'paused') {
            audio.play().then(() => setState('playing')).catch(() => setState('idle'));
          }
        }

        if (msg.type === 'stop') {
          if (audio) {
            audio.pause();
            audio = null;
          }
          index = -1;
          queue = [];
          setState('idle');
        }
      });
    </script>
  </body>
</html>`;
}

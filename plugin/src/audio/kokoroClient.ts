import type { PluginSettings, SynthesisRequest, SynthesisResponse } from "../types";

export class KokoroClient {
  constructor(private readonly settings: PluginSettings) {}

  async synthesizeSentence(request: SynthesisRequest): Promise<SynthesisResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.settings.serverUrl}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    } catch (error) {
      return {
        sessionId: request.sessionId,
        sentenceId: request.sentenceId,
        ok: false,
        error: String(error),
      };
    }

    if (!response.ok) {
      return {
        sessionId: request.sessionId,
        sentenceId: request.sentenceId,
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }

    return (await response.json()) as SynthesisResponse;
  }

  async healthcheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.settings.serverUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

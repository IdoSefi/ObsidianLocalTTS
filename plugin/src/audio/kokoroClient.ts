import { requestUrl } from "obsidian";
import type { PluginSettings, SynthesisRequest, SynthesisResponse } from "../types";

export interface HealthcheckResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface SynthesizeAttemptResult {
  response: SynthesisResponse;
  transportError?: string;
  attempted: boolean;
}

export class KokoroClient {
  constructor(private readonly settings: PluginSettings) {}

  async synthesizeSentence(request: SynthesisRequest): Promise<SynthesizeAttemptResult> {
    const endpoint = `${this.settings.serverUrl}/synthesize`;

    try {
      const response = await requestUrl({
        url: endpoint,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify(request),
      });

      if (response.status >= 400) {
        const responseText = response.text?.trim();
        return {
          attempted: true,
          response: {
            sessionId: request.sessionId,
            sentenceId: request.sentenceId,
            ok: false,
            error: responseText || `HTTP ${response.status}`,
          },
        };
      }

      return {
        attempted: true,
        response: response.json as SynthesisResponse,
      };
    } catch (error) {
      const transportError = stringifyError(error);
      return {
        attempted: true,
        transportError,
        response: {
          sessionId: request.sessionId,
          sentenceId: request.sentenceId,
          ok: false,
          error: transportError,
        },
      };
    }
  }

  async healthcheck(): Promise<HealthcheckResult> {
    try {
      const response = await requestUrl({
        url: `${this.settings.serverUrl}/health`,
        method: "GET",
      });

      if (response.status >= 400) {
        return {
          ok: false,
          status: response.status,
          error: response.text?.trim() || `HTTP ${response.status}`,
        };
      }

      return {
        ok: true,
        status: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        error: stringifyError(error),
      };
    }
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

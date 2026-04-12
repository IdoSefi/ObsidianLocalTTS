import type { SynthesisRequest, SynthesisResponse } from '../types';

export class LocalTtsClient {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`/health failed (${response.status})`);
    }
  }

  async synthesize(payload: SynthesisRequest): Promise<SynthesisResponse> {
    const response = await fetch(`${this.baseUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`/synthesize failed (${response.status})`);
    }

    return (await response.json()) as SynthesisResponse;
  }
}

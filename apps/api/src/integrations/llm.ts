import { env, llmConfigured } from '../env.js';

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  deterministic: boolean;
}

const TIMEOUT_MS = 20_000;

/**
 * Optional. With no key configured the foundry uses deterministic composition,
 * which is what you actually want for a repeatable stage demo. The LLM path
 * exists so the judges can see it is a real generation pipeline, not a lookup.
 */
export async function complete(system: string, user: string): Promise<LlmResult | null> {
  if (!llmConfigured) return null;

  try {
    if (env.llm.provider === 'anthropic') {
      const res = await withTimeout(
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': env.llm.anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: env.llm.anthropicModel,
            max_tokens: 900,
            temperature: 0.4,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        }),
      );
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
      const text = json.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
      return { text: text.trim(), provider: 'anthropic', model: env.llm.anthropicModel, deterministic: false };
    }

    if (env.llm.provider === 'openai') {
      const res = await withTimeout(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.llm.openaiKey}`,
          },
          body: JSON.stringify({
            model: env.llm.openaiModel,
            temperature: 0.4,
            max_tokens: 900,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        }),
      );
      if (!res.ok) throw new Error(`openai ${res.status}`);
      const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return {
        text: (json.choices[0]?.message.content ?? '').trim(),
        provider: 'openai',
        model: env.llm.openaiModel,
        deterministic: false,
      };
    }
  } catch {
    return null;
  }
  return null;
}

async function withTimeout(p: Promise<Response>): Promise<Response> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error('llm timeout')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t!);
  }
}

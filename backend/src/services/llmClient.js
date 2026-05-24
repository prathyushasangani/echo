import OpenAI from 'openai';

export function getLlmConfig() {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();

  if ((provider === 'abacus' || process.env.ABACUSAI_API_KEY) && process.env.ABACUSAI_API_KEY) {
    return {
      apiKey: process.env.ABACUSAI_API_KEY,
      baseURL: process.env.ABACUS_BASE_URL || 'https://routellm.abacus.ai/v1',
      model: process.env.ABACUS_MODEL || 'route-llm'
    };
  }

  if ((provider === 'openai' || process.env.OPENAI_API_KEY) && process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    };
  }

  return null;
}

export function createLlmClient(config = getLlmConfig()) {
  if (!config) return null;
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
}


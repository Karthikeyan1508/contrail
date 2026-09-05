import 'dotenv/config';

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const env = {
  port: Number(str('PORT', '4000')),
  webOrigin: str('WEB_ORIGIN', 'http://localhost:3000'),

  amadeus: {
    clientId: str('AMADEUS_CLIENT_ID'),
    clientSecret: str('AMADEUS_CLIENT_SECRET'),
    host: str('AMADEUS_HOST', 'https://test.api.amadeus.com'),
    carrierCode: str('DEMO_CARRIER_CODE', '6E'),
    flightNumber: str('DEMO_FLIGHT_NUMBER', '860'),
    flightDate: str('DEMO_FLIGHT_DATE', '2026-09-05'),
  },

  contentstack: {
    mode: str('CONTENTSTACK_MODE', 'local') as 'local' | 'live',
    apiKey: str('CONTENTSTACK_API_KEY'),
    deliveryToken: str('CONTENTSTACK_DELIVERY_TOKEN'),
    managementToken: str('CONTENTSTACK_MANAGEMENT_TOKEN'),
    environment: str('CONTENTSTACK_ENVIRONMENT', 'production'),
    region: str('CONTENTSTACK_REGION', 'eu'),
    contentType: str('CONTENTSTACK_CONTENT_TYPE', 'disruption_message'),
    // Must be the stack's master locale. Starter stacks are often `en`, not `en-us`.
    locale: str('CONTENTSTACK_LOCALE', 'en'),
  },

  llm: {
    provider: str('LLM_PROVIDER', 'none') as 'none' | 'anthropic' | 'openai',
    anthropicKey: str('ANTHROPIC_API_KEY'),
    anthropicModel: str('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
    openaiKey: str('OPENAI_API_KEY'),
    openaiModel: str('OPENAI_MODEL', 'gpt-4o-mini'),
  },
};

export const amadeusConfigured = Boolean(
  env.amadeus.clientId && env.amadeus.clientSecret,
);

export const contentstackConfigured =
  env.contentstack.mode === 'live' &&
  Boolean(env.contentstack.apiKey && env.contentstack.managementToken);

export const llmConfigured =
  (env.llm.provider === 'anthropic' && Boolean(env.llm.anthropicKey)) ||
  (env.llm.provider === 'openai' && Boolean(env.llm.openaiKey));

import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { router } from './routes.js';
import { getRepository, repositoryNote } from './store/index.js';
import { PERSONAS } from './ledger/personas.js';
import { buildLedger } from './ledger/buildLedger.js';
import { refreshEdge, edgeEnabled } from './integrations/personalizeEdge.js';

const app = express();

app.use(cors({ origin: [env.webOrigin, 'http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', router);

app.get('/', (_req, res) => {
  res.json({ service: 'contrail-api', docs: '/api/health' });
});

const repo = await getRepository();

/**
 * Warm the Personalize edge for the demo personas.
 *
 * The render path only ever reads this cache, so without a warm-up the first
 * render would report the local match alone. Doing it here keeps the round
 * trip off the customer path entirely, and out of the timings on screen.
 */
async function warmPersonalizeEdge(): Promise<void> {
  if (!edgeEnabled()) return;
  const started = Date.now();
  const results = await Promise.allSettled(
    PERSONAS.map(async (p) => {
      const { context } = await buildLedger(p, 'cancellation');
      return refreshEdge(`contrail-${p.id}`, context.attributes, null);
    }),
  );
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  console.log(`    personalize edge: ${ok}/${PERSONAS.length} warmed in ${Date.now() - started}ms`);
}

app.listen(env.port, () => {
  console.log('');
  console.log('  ▲ Contrail API');
  console.log(`    http://localhost:${env.port}/api/health`);
  console.log(`    variant store: ${repo.kind} — ${repositoryNote()}`);
    void warmPersonalizeEdge();
  console.log('');
});

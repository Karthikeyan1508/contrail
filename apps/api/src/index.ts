import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { router } from './routes.js';
import { getRepository, repositoryNote } from './store/index.js';

const app = express();

app.use(cors({ origin: [env.webOrigin, 'http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', router);

app.get('/', (_req, res) => {
  res.json({ service: 'contrail-api', docs: '/api/health' });
});

const repo = await getRepository();

app.listen(env.port, () => {
  console.log('');
  console.log('  ▲ Contrail API');
  console.log(`    http://localhost:${env.port}/api/health`);
  console.log(`    variant store: ${repo.kind} — ${repositoryNote()}`);
  console.log('');
});

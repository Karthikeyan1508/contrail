import { contentstackConfigured, env } from '../env.js';
import type { VariantRepository } from './repository.js';
import { LocalRepository } from './localRepository.js';
import { ContentstackRepository } from '../integrations/contentstack.js';

let repo: VariantRepository | null = null;
let repoNote = '';

export async function getRepository(): Promise<VariantRepository> {
  if (repo) return repo;

  if (contentstackConfigured) {
    const cs = new ContentstackRepository();
    try {
      await cs.init();
      repo = cs;
      repoNote = `Contentstack (${env.contentstack.region}, env ${env.contentstack.environment})`;
      return repo;
    } catch (err) {
      repoNote = `Contentstack unavailable — ${(err as Error).message} — using local store`;
    }
  } else {
    repoNote = 'Local on-disk variant store (CONTENTSTACK_MODE=local)';
  }

  const local = new LocalRepository();
  await local.init();
  repo = local;
  return repo;
}

export function repositoryNote(): string {
  return repoNote;
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gap, Variant, VariantKey } from '../types.js';
import { keyOf, parseKey, type VariantRepository } from './repository.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(HERE, '../../.data');
const VARIANTS = resolve(DATA_DIR, 'variants.json');
const OBSERVATIONS = resolve(DATA_DIR, 'observations.json');

interface Shape {
  variants: Record<string, Variant>;
  observations: Record<string, { hits: number; firstSeenAt: string }>;
}

/**
 * On-disk variant store. Stands in for Contentstack so the whole system runs
 * with zero credentials, and mirrors its semantics exactly: entries have uids,
 * versions and a publish state, and rollback restores the previous version.
 */
export class LocalRepository implements VariantRepository {
  readonly kind = 'local' as const;
  private state: Shape = { variants: {}, observations: {} };
  private dirty = false;
  private exitHooked = false;

  async init(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    this.state.variants = await readJson<Record<string, Variant>>(VARIANTS, {});
    this.state.observations = await readJson<Shape['observations']>(OBSERVATIONS, {});
    this.hookExitFlush();
  }

  async get(key: VariantKey): Promise<Variant | null> {
    return this.state.variants[keyOf(key)] ?? null;
  }

  async list(): Promise<Variant[]> {
    return Object.values(this.state.variants).sort((a, b) =>
      a.variantAlias.localeCompare(b.variantAlias),
    );
  }

  async upsert(variant: Variant): Promise<Variant> {
    const k = keyOf(variant.key);
    const existing = this.state.variants[k];
    const next: Variant = existing
      ? {
          ...variant,
          uid: existing.uid,
          version: existing.version + 1,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
          history: [
            { version: existing.version, slottedBody: existing.slottedBody, at: existing.updatedAt },
            ...existing.history,
          ].slice(0, 10),
        }
      : variant;
    this.state.variants[k] = next;
    await this.flush();
    return next;
  }

  async rollback(uid: string): Promise<Variant | null> {
    const entry = Object.entries(this.state.variants).find(([, v]) => v.uid === uid);
    if (!entry) return null;
    const [k, v] = entry;
    const [prev, ...rest] = v.history;
    if (!prev) return v;
    const restored: Variant = {
      ...v,
      slottedBody: prev.slottedBody,
      version: v.version + 1,
      updatedAt: new Date().toISOString(),
      history: rest,
    };
    this.state.variants[k] = restored;
    await this.flush();
    return restored;
  }

  async remove(uid: string): Promise<boolean> {
    const entry = Object.entries(this.state.variants).find(([, v]) => v.uid === uid);
    if (!entry) return false;
    delete this.state.variants[entry[0]];
    await this.flush();
    return true;
  }

  /**
   * Runtime telemetry, held in memory on purpose.
   *
   * The assembler sits on the customer path, so recording an observation must
   * not cost a disk write. In dev it must also not touch a file the Next
   * watcher can see: writing .data on every render made Turbopack fire Fast
   * Refresh, which remounted the wall, which re-rendered, which wrote again —
   * a visible flicker loop with nobody touching the page.
   *
   * Observations are persisted on the next variant mutation and on process
   * exit. Nothing depends on them being durable mid-session: coverage and the
   * gap queue read this same in-memory state, and a gap is re-observed the
   * moment a page renders again.
   */
  async observe(key: VariantKey): Promise<void> {
    const k = keyOf(key);
    const o = this.state.observations[k];
    this.state.observations[k] = o
      ? { hits: o.hits + 1, firstSeenAt: o.firstSeenAt }
      : { hits: 1, firstSeenAt: new Date().toISOString() };
    this.dirty = true;
  }

  async observations(): Promise<Shape['observations']> {
    return this.state.observations;
  }

  async gaps(): Promise<Gap[]> {
    const out: Gap[] = [];
    for (const [k, o] of Object.entries(this.state.observations)) {
      if (this.state.variants[k]) continue;
      const key = parseKey(k);
      out.push({ combination: k, ...key, firstSeenAt: o.firstSeenAt, hits: o.hits });
    }
    return out.sort((a, b) => b.hits - a.hits);
  }

  private async flush(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await Promise.all([
      writeFile(VARIANTS, JSON.stringify(this.state.variants, null, 2), 'utf8'),
      writeFile(OBSERVATIONS, JSON.stringify(this.state.observations, null, 2), 'utf8'),
    ]);
    this.dirty = false;
  }

  /** Last-chance synchronous persist, so observations survive Ctrl-C. */
  private hookExitFlush(): void {
    if (this.exitHooked) return;
    this.exitHooked = true;
    const persist = () => {
      if (!this.dirty) return;
      try {
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(OBSERVATIONS, JSON.stringify(this.state.observations, null, 2), 'utf8');
        this.dirty = false;
      } catch {
        // A demo must not fail on the way out.
      }
    };
    process.once('exit', persist);
    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.once(sig, () => {
        persist();
        process.exit(0);
      });
    }
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

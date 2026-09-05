import fixture from '../fixtures/flight.json' with { type: 'json' };
import { env, amadeusConfigured, aviationstackConfigured } from '../env.js';
import { fetchAviationStack } from './aviationstack.js';
import { fetchAmadeus } from './amadeus.js';

export interface FlightSnapshot {
  live: boolean;
  /** Which source answered, so the UI can never mislabel it. */
  provider: FlightProvider;
  sourceDetail: string;
  retrievedAt: string;
  carrierCode: string;
  flightNumber: string;
  designator: string;
  scheduledDepartureDate: string;
  departure: { iataCode: string; city: string; terminal: string; scheduledTime: string };
  arrival: { iataCode: string; city: string; terminal: string; scheduledTime: string };
  aircraft: string;
  blockTimeMinutes: number;
  distanceKm: number;
  status: string;
  rebookingOptions: Array<{
    designator: string;
    departureTime: string;
    arrivalTime: string;
    seatsAvailable: number;
    cabin: string;
  }>;
}

/**
 * What a live provider is permitted to change.
 *
 * `status`, `rebookingOptions` and `distanceKm` are deliberately absent. No
 * public schedule API carries re-accommodation inventory, and the demo's
 * cancellation is world state we own rather than something to be read off a
 * real aircraft. Leaving them out of this type makes it structurally
 * impossible for a live call to overwrite them.
 */
export interface FlightPatch {
  carrierCode?: string;
  flightNumber?: string;
  designator?: string;
  scheduledDepartureDate?: string;
  departure?: Partial<FlightSnapshot['departure']>;
  arrival?: Partial<FlightSnapshot['arrival']>;
  aircraft?: string;
  blockTimeMinutes?: number;
  /** The carrier-reported status, surfaced in the badge tooltip only. */
  liveStatus?: string;
  sourceDetail: string;
}

export type FlightProvider = 'aviationstack' | 'amadeus' | 'fixture';

const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
let snapshotCache: { at: number; value: FlightSnapshot } | null = null;

/** Which source a call would use right now, given the configured keys. */
export function activeProvider(): FlightProvider {
  const choice = env.flight.provider;
  if (choice === 'aviationstack') return aviationstackConfigured ? 'aviationstack' : 'fixture';
  if (choice === 'amadeus') return amadeusConfigured ? 'amadeus' : 'fixture';
  if (choice === 'fixture') return 'fixture';
  if (aviationstackConfigured) return 'aviationstack';
  if (amadeusConfigured) return 'amadeus';
  return 'fixture';
}

/**
 * The flight snapshot the ledger is built from. Any failure falls back to the
 * cached fixture and says so in `sourceDetail`, so the demo cannot break on
 * conference wifi.
 */
export async function getFlightSnapshot(): Promise<FlightSnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.value;
  }

  const base = fromFixture();
  const provider = activeProvider();

  if (provider === 'fixture') {
    snapshotCache = { at: Date.now(), value: base };
    return base;
  }

  try {
    const patch =
      provider === 'aviationstack' ? await fetchAviationStack() : await fetchAmadeus();
    if (!patch) throw new Error('provider returned no matching flight');

    const merged: FlightSnapshot = {
      ...base,
      live: true,
      provider,
      retrievedAt: new Date().toISOString(),
      sourceDetail: patch.sourceDetail,
      carrierCode: patch.carrierCode ?? base.carrierCode,
      flightNumber: patch.flightNumber ?? base.flightNumber,
      designator: patch.designator ?? base.designator,
      scheduledDepartureDate: patch.scheduledDepartureDate ?? base.scheduledDepartureDate,
      departure: { ...base.departure, ...patch.departure },
      arrival: { ...base.arrival, ...patch.arrival },
      aircraft: patch.aircraft ?? base.aircraft,
      blockTimeMinutes: patch.blockTimeMinutes || base.blockTimeMinutes,
      // status, rebookingOptions and distanceKm intentionally keep their
      // fixture values — see FlightPatch.
    };

    snapshotCache = { at: Date.now(), value: merged };
    return merged;
  } catch (err) {
    const degraded: FlightSnapshot = {
      ...base,
      sourceDetail: `${base.sourceDetail} — ${provider} call failed (${(err as Error).message})`,
    };
    snapshotCache = { at: Date.now(), value: degraded };
    return degraded;
  }
}

function fromFixture(): FlightSnapshot {
  return {
    live: false,
    provider: 'fixture',
    sourceDetail: fixture.sourceDetail,
    retrievedAt: new Date().toISOString(),
    carrierCode: fixture.carrierCode,
    flightNumber: fixture.flightNumber,
    designator: fixture.designator,
    scheduledDepartureDate: fixture.scheduledDepartureDate,
    departure: fixture.departure,
    arrival: fixture.arrival,
    aircraft: fixture.aircraft,
    blockTimeMinutes: fixture.blockTimeMinutes,
    distanceKm: 1740,
    status: fixture.status,
    rebookingOptions: fixture.rebookingOptions,
  };
}

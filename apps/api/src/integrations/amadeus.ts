import { env, amadeusConfigured } from '../env.js';
import fixture from '../fixtures/flight.json' with { type: 'json' };

export interface FlightSnapshot {
  live: boolean;
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

let tokenCache: { token: string; expiresAt: number } | null = null;
let snapshotCache: { at: number; value: FlightSnapshot } | null = null;

const SNAPSHOT_TTL_MS = 5 * 60 * 1000;

async function getToken(): Promise<string | null> {
  if (!amadeusConfigured) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.amadeus.clientId,
    client_secret: env.amadeus.clientSecret,
  });

  const res = await fetchWithTimeout(`${env.amadeus.host}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, 8000);

  if (!res.ok) throw new Error(`Amadeus token failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return tokenCache.token;
}

/**
 * On-Demand Flight Status. Falls back to the on-disk fixture on any failure so
 * the demo never depends on conference wifi.
 */
export async function getFlightSnapshot(): Promise<FlightSnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.value;
  }

  const fallback = fromFixture();

  if (!amadeusConfigured) {
    snapshotCache = { at: Date.now(), value: fallback };
    return fallback;
  }

  try {
    const token = await getToken();
    if (!token) return fallback;

    const url = new URL(`${env.amadeus.host}/v2/schedule/flights`);
    url.searchParams.set('carrierCode', env.amadeus.carrierCode);
    url.searchParams.set('flightNumber', env.amadeus.flightNumber);
    url.searchParams.set('scheduledDepartureDate', env.amadeus.flightDate);

    const res = await fetchWithTimeout(
      url.toString(),
      { headers: { Authorization: `Bearer ${token}` } },
      8000,
    );
    if (!res.ok) throw new Error(`Amadeus flight status ${res.status}`);

    const json = (await res.json()) as AmadeusScheduleResponse;
    const first = json.data?.[0];
    if (!first) throw new Error('Amadeus returned no flight points');

    const merged = mergeLive(fallback, first);
    snapshotCache = { at: Date.now(), value: merged };
    return merged;
  } catch (err) {
    const degraded: FlightSnapshot = {
      ...fallback,
      sourceDetail: `${fallback.sourceDetail} — live call failed (${(err as Error).message})`,
    };
    snapshotCache = { at: Date.now(), value: degraded };
    return degraded;
  }
}

interface AmadeusScheduleResponse {
  data?: Array<{
    scheduledDepartureDate?: string;
    flightDesignator?: { carrierCode?: string; flightNumber?: number };
    flightPoints?: Array<{
      iataCode?: string;
      departure?: { timings?: Array<{ qualifier?: string; value?: string }> };
      arrival?: { timings?: Array<{ qualifier?: string; value?: string }> };
    }>;
    legs?: Array<{ aircraftEquipment?: { aircraftType?: string }; scheduledLegDuration?: string }>;
  }>;
}

function mergeLive(base: FlightSnapshot, d: NonNullable<AmadeusScheduleResponse['data']>[number]): FlightSnapshot {
  const points = d.flightPoints ?? [];
  const dep = points[0];
  const arr = points[points.length - 1];
  const depTime = dep?.departure?.timings?.[0]?.value;
  const arrTime = arr?.arrival?.timings?.[0]?.value;
  const aircraft = d.legs?.[0]?.aircraftEquipment?.aircraftType;

  return {
    ...base,
    live: true,
    sourceDetail: 'Amadeus On-Demand Flight Status v2 (test environment, live call)',
    retrievedAt: new Date().toISOString(),
    carrierCode: d.flightDesignator?.carrierCode ?? base.carrierCode,
    flightNumber: String(d.flightDesignator?.flightNumber ?? base.flightNumber),
    designator: `${d.flightDesignator?.carrierCode ?? base.carrierCode}-${d.flightDesignator?.flightNumber ?? base.flightNumber}`,
    scheduledDepartureDate: d.scheduledDepartureDate ?? base.scheduledDepartureDate,
    departure: {
      ...base.departure,
      iataCode: dep?.iataCode ?? base.departure.iataCode,
      scheduledTime: depTime ?? base.departure.scheduledTime,
    },
    arrival: {
      ...base.arrival,
      iataCode: arr?.iataCode ?? base.arrival.iataCode,
      scheduledTime: arrTime ?? base.arrival.scheduledTime,
    },
    aircraft: aircraft ?? base.aircraft,
    blockTimeMinutes: durationMinutes(d.legs?.[0]?.scheduledLegDuration) ?? base.blockTimeMinutes,
  };
}

function durationMinutes(iso?: string): number | null {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso);
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

function fromFixture(): FlightSnapshot {
  return {
    live: false,
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

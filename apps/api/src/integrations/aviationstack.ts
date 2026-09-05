import { env } from '../env.js';
import type { FlightPatch } from './flightStatus.js';

/**
 * AviationStack adapter.
 *
 * The free plan rejects the `flight_date` parameter, so the query is for the
 * current day — which is what a disruption system cares about anyway.
 *
 * Two quirks of the payload are handled here:
 *
 *  1. A search by `flight_iata` returns every marketing carrier on the metal,
 *     so the operating record is the one whose airline matches and whose
 *     `flight.codeshared` is null. Without that filter the demo could report
 *     the flight as a Qantas or Virgin Atlantic service.
 *  2. Times come back as local wall-clock stamped with a `+00:00` offset,
 *     while the true zone is given separately in `departure.timezone`. Taken
 *     literally, a 15:45 departure from Bengaluru renders as 21:15. The offset
 *     is recomputed from the named zone below.
 */

interface AsFlight {
  flight_date?: string;
  flight_status?: string;
  departure?: AsPoint;
  arrival?: AsPoint;
  airline?: { name?: string; iata?: string };
  flight?: { number?: string; iata?: string; codeshared?: unknown };
  aircraft?: { iata?: string | null; icao?: string | null } | null;
}

interface AsPoint {
  airport?: string;
  timezone?: string;
  iata?: string;
  terminal?: string | null;
  gate?: string | null;
  delay?: number | null;
  scheduled?: string | null;
  estimated?: string | null;
}

interface AsResponse {
  data?: AsFlight[];
  error?: { code?: string; message?: string };
}

export async function fetchAviationStack(): Promise<FlightPatch | null> {
  const carrier = env.flight.carrierCode.toUpperCase();
  const iata = `${carrier}${env.flight.flightNumber}`;

  const url = new URL(`${env.aviationstack.host}/v1/flights`);
  url.searchParams.set('access_key', env.aviationstack.accessKey);
  url.searchParams.set('flight_iata', iata);
  url.searchParams.set('limit', '20');

  const res = await fetchWithTimeout(url.toString(), {}, 8000);
  if (!res.ok) throw new Error(`AviationStack HTTP ${res.status}`);

  // Errors arrive inside a 200 response, so the body decides, not the status.
  const json = (await res.json()) as AsResponse;
  if (json.error) {
    throw new Error(`AviationStack ${json.error.code ?? 'error'}: ${json.error.message ?? ''}`.trim());
  }

  const rows = json.data ?? [];
  const operating =
    rows.find((r) => r.airline?.iata?.toUpperCase() === carrier && !r.flight?.codeshared) ??
    rows.find((r) => r.flight?.iata?.toUpperCase() === iata) ??
    null;
  if (!operating) return null;

  const dep = operating.departure ?? {};
  const arr = operating.arrival ?? {};
  const depTime = localise(dep.scheduled, dep.timezone);
  const arrTime = localise(arr.scheduled, arr.timezone);

  const status = operating.flight_status ?? 'unknown';
  const gate = dep.gate ? `, gate ${dep.gate}` : '';

  return {
    carrierCode: carrier,
    flightNumber: String(operating.flight?.number ?? env.flight.flightNumber),
    designator: `${carrier}-${operating.flight?.number ?? env.flight.flightNumber}`,
    scheduledDepartureDate: operating.flight_date ?? env.flight.flightDate,
    departure: {
      ...(dep.iata ? { iataCode: dep.iata } : {}),
      ...(dep.terminal ? { terminal: dep.terminal } : {}),
      ...(depTime ? { scheduledTime: depTime } : {}),
    },
    arrival: {
      ...(arr.iata ? { iataCode: arr.iata } : {}),
      ...(arr.terminal ? { terminal: arr.terminal } : {}),
      ...(arrTime ? { scheduledTime: arrTime } : {}),
    },
    ...(operating.aircraft?.iata ? { aircraft: operating.aircraft.iata } : {}),
    ...(depTime && arrTime ? { blockTimeMinutes: minutesBetween(depTime, arrTime) } : {}),
    liveStatus: status,
    sourceDetail:
      `AviationStack live — ${iata} ${dep.iata ?? '?'}→${arr.iata ?? '?'}, ` +
      `carrier-reported status "${status}"${gate}. ` +
      `Re-accommodation inventory and the demo's cancellation are world state, not schedule data.`,
  };
}

/**
 * Re-stamp a wall-clock time with the real offset for its named zone.
 * India has no DST, so a single lookup at the instant is sufficient.
 */
function localise(raw: string | null | undefined, timeZone: string | null | undefined): string | null {
  if (!raw) return null;
  const wall = raw.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '');
  if (!timeZone) return wall;
  try {
    const at = new Date(`${wall}Z`);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = /GMT([+-]\d{2}:\d{2})/.exec(name);
    return m ? `${wall}${m[1]}` : wall;
  } catch {
    return wall;
  }
}

function minutesBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : 0;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

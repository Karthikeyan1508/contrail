import { env, amadeusConfigured } from '../env.js';
import type { FlightPatch } from './flightStatus.js';

/**
 * Amadeus On-Demand Flight Status adapter.
 *
 * Amadeus decommissioned the self-service developer portal on 17 July 2026 and
 * deactivated its keys, so `test.api.amadeus.com` no longer resolves. The
 * adapter is kept because the host is a single environment variable: point
 * AMADEUS_HOST at an Enterprise endpoint and supply credentials, and this path
 * comes back without touching anything else. Until then the provider resolver
 * skips it in favour of AviationStack.
 */

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!amadeusConfigured) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.amadeus.clientId,
    client_secret: env.amadeus.clientSecret,
  });

  const res = await fetchWithTimeout(
    `${env.amadeus.host}/v1/security/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    8000,
  );

  if (!res.ok) throw new Error(`Amadeus token failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return tokenCache.token;
}

export async function fetchAmadeus(): Promise<FlightPatch | null> {
  const token = await getToken();
  if (!token) return null;

  const url = new URL(`${env.amadeus.host}/v2/schedule/flights`);
  url.searchParams.set('carrierCode', env.flight.carrierCode);
  url.searchParams.set('flightNumber', env.flight.flightNumber);
  url.searchParams.set('scheduledDepartureDate', env.flight.flightDate);

  const res = await fetchWithTimeout(
    url.toString(),
    { headers: { Authorization: `Bearer ${token}` } },
    8000,
  );
  if (!res.ok) throw new Error(`Amadeus flight status ${res.status}`);

  const json = (await res.json()) as AmadeusScheduleResponse;
  const d = json.data?.[0];
  if (!d) return null;

  const points = d.flightPoints ?? [];
  const dep = points[0];
  const arr = points[points.length - 1];
  const depTime = dep?.departure?.timings?.[0]?.value;
  const arrTime = arr?.arrival?.timings?.[0]?.value;
  const carrier = d.flightDesignator?.carrierCode ?? env.flight.carrierCode;
  const number = String(d.flightDesignator?.flightNumber ?? env.flight.flightNumber);

  return {
    carrierCode: carrier,
    flightNumber: number,
    designator: `${carrier}-${number}`,
    scheduledDepartureDate: d.scheduledDepartureDate ?? env.flight.flightDate,
    departure: {
      ...(dep?.iataCode ? { iataCode: dep.iataCode } : {}),
      ...(depTime ? { scheduledTime: depTime } : {}),
    },
    arrival: {
      ...(arr?.iataCode ? { iataCode: arr.iataCode } : {}),
      ...(arrTime ? { scheduledTime: arrTime } : {}),
    },
    ...(d.legs?.[0]?.aircraftEquipment?.aircraftType
      ? { aircraft: d.legs[0]!.aircraftEquipment!.aircraftType! }
      : {}),
    ...(durationMinutes(d.legs?.[0]?.scheduledLegDuration) !== null
      ? { blockTimeMinutes: durationMinutes(d.legs?.[0]?.scheduledLegDuration)! }
      : {}),
    sourceDetail: 'Amadeus On-Demand Flight Status v2 (live call)',
  };
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

function durationMinutes(iso?: string): number | null {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso);
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
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

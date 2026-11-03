import { AppError } from '@bladna/types';
import { env } from '../env';

/**
 * Map / geocoding adapter.
 *
 *  - `local` (default): coordinates come from stored location records
 *    (Wilaya/City lat/lng); distance math is done in `@bladna/domain`.
 *    No external calls — works offline.
 *  - `nominatim` / `google`: real HTTP geocoding when configured; otherwise a
 *    clear configuration error (no silent provider binding in the domain).
 *
 * The JS key is only exposed to the client when explicitly set (§96 — no keys
 * in bundles by accident).
 */

export type MapProvider = 'local' | 'nominatim' | 'google';

export function currentProvider(): MapProvider {
  const raw = env.mapProvider || 'local';
  return (['local', 'nominatim', 'google'] as const).includes(raw as MapProvider)
    ? (raw as MapProvider)
    : 'local';
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  provider: MapProvider;
}

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const provider = currentProvider();
  if (provider === 'local') {
    throw AppError.notImplemented(
      'The local map provider resolves coordinates from stored locations only; set MAP_PROVIDER=nominatim or google for address lookups.',
    );
  }
  if (provider === 'google' && !env.googleMapsApiKey) {
    throw AppError.config('MAP_PROVIDER=google requires GOOGLE_MAPS_API_KEY.');
  }

  const url =
    provider === 'nominatim'
      ? `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`
      : `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${env.googleMapsApiKey}`;

  const res = await fetch(url, {
    headers: provider === 'nominatim' ? { 'User-Agent': 'bladna/1.0' } : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new AppError('EXTERNAL_SERVICE_ERROR', `Geocoding failed (${res.status}).`);
  const data = (await res.json()) as unknown;

  if (provider === 'nominatim') {
    const rows = data as Array<{ display_name: string; lat: string; lon: string }>;
    return rows.map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      provider,
    }));
  }
  const rows =
    (
      data as {
        results?: Array<{
          formatted_address: string;
          geometry: { location: { lat: number; lng: number } };
        }>;
      }
    ).results ?? [];
  return rows.map((r) => ({
    label: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    provider,
  }));
}

/** Client-safe map config (never includes server secrets). */
export function clientMapConfig(): { provider: MapProvider; hasKey: boolean; key?: string } {
  const provider = currentProvider();
  if (provider === 'google' && env.mapPublicKey) {
    return { provider, hasKey: true, key: env.mapPublicKey };
  }
  return { provider, hasKey: false };
}

#!/usr/bin/env node
/**
 * Build the bundled base geography for the initiative map (P3 / RESEARCH H5).
 *
 *   npx tsx scripts/geo/build-map-geo.ts        (or: npm run build:map-geo)
 *
 * Reads  scripts/geo/wilaya-boundaries.geojson   (vendored source, ODbL-1.0,
 *                                                byte-identical to upstream —
 *                                                see wilaya-boundaries.metadata.json)
 * Writes apps/web/src/ui/map/algeria-geo.ts      (generated — never hand-edit)
 *
 * Pipeline: Douglas-Peucker simplify per ring (tolerance 0.02° ≈ 0.9 px at
 * the map's render scale) → quantize to integer degrees × 100 (0.01° ≈ 0.4 px)
 * → drop rings that collapse below 3 distinct points. Any feature that loses
 * every ring fails the build (a missing wilaya outline must never ship
 * silently).
 *
 * Provenance and licence: OpenStreetMap admin_level=4 relations via
 * GeoAlgeria, ODbL-1.0. The output file is a Derivative Database and carries
 * the ODbL notice in its header; the map UI renders the required
 * "© OpenStreetMap contributors" attribution.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'wilaya-boundaries.geojson');
const OUT_DIR = join(HERE, '..', '..', 'apps', 'web', 'src', 'ui', 'map');
const OUT = join(OUT_DIR, 'algeria-geo.ts');

const DP_TOLERANCE = 0.02; // degrees
const QUANTIZE = 100; // integer scale (0.01° precision)

type Coord = number[];

interface GeoJsonFeature {
  properties?: { code?: number };
  geometry: { type: string; coordinates: Coord[][] | Coord[][][] } | null;
}

interface GeoJsonDoc {
  type: string;
  features: GeoJsonFeature[];
}

/** Iterative Douglas-Peucker on an open polyline of [lng, lat] pairs. */
function simplifyPolyline(pts: Coord[], tol: number): Coord[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    if (b - a < 2) continue;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = pts[i];
      let dist: number;
      if (len2 === 0) {
        dist = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > tol && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([a, maxIdx], [maxIdx, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

/** Simplify a closed ring, keeping it closed (no duplicate endpoints kept). */
function simplifyRing(raw: Coord[], tol: number): Coord[] {
  let pts = raw;
  const first = raw[0];
  const last = raw[raw.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) pts = raw.slice(0, -1);
  if (pts.length < 4) return pts;
  // Split at the point farthest from pts[0] so DP anchors on real geometry
  // instead of the degenerate first==last ring closure.
  let split = 1;
  let best = -1;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > best) {
      best = d;
      split = i;
    }
  }
  const partA = simplifyPolyline(pts.slice(0, split + 1), tol);
  const partB = simplifyPolyline([...pts.slice(split), pts[0]], tol);
  return [...partA, ...partB.slice(1, -1)];
}

/** Degrees → integer pairs, dropping consecutive duplicates and closure dupes. */
function encodeRing(ring: Coord[]): number[] | null {
  const out: number[] = [];
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  for (const [lng, lat] of ring) {
    const x = Math.round(lng * QUANTIZE);
    const y = Math.round(lat * QUANTIZE);
    if (x === lastX && y === lastY) continue;
    out.push(x, y);
    lastX = x;
    lastY = y;
  }
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) {
    out.splice(-2); // SVG path Z closes the ring — never store it twice
  }
  return out.length >= 6 ? out : null; // need ≥3 distinct points
}

const geojson = JSON.parse(readFileSync(SRC, 'utf8')) as GeoJsonDoc;
if (geojson.type !== 'FeatureCollection') throw new Error('source is not a FeatureCollection');

const rings: number[][] = [];
const bbox = [Infinity, Infinity, -Infinity, -Infinity];
let features = 0;
let verticesBefore = 0;

for (const feature of geojson.features) {
  features += 1;
  const geom = feature.geometry;
  if (!geom) throw new Error(`feature ${feature.properties?.code ?? '?'} has no geometry`);
  const polygons: Coord[][][] | null =
    geom.type === 'Polygon'
      ? [geom.coordinates as Coord[][]]
      : geom.type === 'MultiPolygon'
        ? (geom.coordinates as Coord[][][])
        : null;
  if (!polygons) throw new Error(`feature ${feature.properties?.code ?? '?'} is ${geom.type}`);

  let kept = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      verticesBefore += ring.length;
      for (const [lng, lat] of ring) {
        if (lng < bbox[0]) bbox[0] = lng;
        if (lat < bbox[1]) bbox[1] = lat;
        if (lng > bbox[2]) bbox[2] = lng;
        if (lat > bbox[3]) bbox[3] = lat;
      }
      const simplified = simplifyRing(ring, DP_TOLERANCE);
      const encoded = encodeRing(simplified);
      if (encoded) {
        rings.push(encoded);
        kept += 1;
      }
    }
  }
  if (kept === 0) {
    throw new Error(
      `feature ${feature.properties?.code ?? '?'} lost every ring — refusing to build`,
    );
  }
}

const verticesAfter = rings.reduce((sum, ring) => sum + ring.length / 2, 0);
const fmt = (n: number): number => Number(n.toFixed(3));

const source = `/**
 * Bundled base geography for the initiative map (P3 / RESEARCH H5).
 *
 * GENERATED by \`npx tsx scripts/geo/build-map-geo.ts\` — do not edit by hand.
 * Source:   scripts/geo/wilaya-boundaries.geojson
 * Provenance: scripts/geo/wilaya-boundaries.metadata.json (OpenStreetMap
 *   admin_level=4 relations via GeoAlgeria, retrieved 2026-06-21).
 *
 * LICENCE — Derivative Database under ODbL-1.0:
 * Database (c) OpenStreetMap contributors. This file is derived from the
 * OpenStreetMap database and is distributed under the Open Database Licence
 * (https://opendatacommons.org/licenses/odbl/1-0/). The map UI renders the
 * required attribution ("© OpenStreetMap contributors") — keep it visible.
 *
 * ${features} features, ${verticesBefore} source vertices → ${verticesAfter} after
 * Douglas-Peucker ${DP_TOLERANCE}° + quantization to ${1 / QUANTIZE}° (integer degrees × ${QUANTIZE}).
 * Ring encoding: flat integers, [lng, lat, lng, lat, …] in degrees × ${QUANTIZE};
 * draw every ring with fill-rule="evenodd" so holes stay holes.
 *
 * NOTE: these are the 69-wilaya (2026 reform) boundaries — the app's
 * \`Wilaya\` table still holds the 58-wilaya (2019) set. The outlines are
 * unlabeled geographic context for pin orientation, never an administrative
 * claim, so no wilaya names or counts are rendered from this file.
 */
export const ALGERIA_BBOX = {
  minLng: ${fmt(bbox[0])},
  minLat: ${fmt(bbox[1])},
  maxLng: ${fmt(bbox[2])},
  maxLat: ${fmt(bbox[3])},
} as const;

/** ${rings.length} rings (outlines + holes), flat integers as described above. */
export const ALGERIA_RINGS: readonly (readonly number[])[] = ${JSON.stringify(rings)};

/** ODbL attribution — render next to the map, both directions. */
export const GEO_ATTRIBUTION = '© OpenStreetMap contributors';
export const GEO_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, source, 'utf8');
console.log(
  `wrote ${OUT}: ${features} features, ${rings.length} rings, ${verticesAfter} vertices (from ${verticesBefore})`,
);

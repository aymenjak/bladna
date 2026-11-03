'use client';

// P6 "adopt standard libraries": the map ENGINE is Leaflet — projection,
// dragging, keyboard panning and marker positioning are no longer hand-rolled.
// What stays is the product design: the bundled OSM base geography (ODbL,
// attributed below), the kit-styled controls, the "search this area" re-query
// through discover `bounds`, and the side list as the visible,
// keyboard-accessible alternative to every pin.
//
// P11 craft layer: pins within 30px of each other fold into a cluster badge
// (they'd otherwise blob together at country zoom), the side list and the
// pins share one hover/focus state, and the canvas carries an atlas finish
// (jade land tint, compass rose, permanent results chip).
//
// SSR contract: the server renders a static poster of the geography in the
// same Mercator frame Leaflet fits (EPSG:3857, continuous zoom), so the probe
// sees the outline + pins in the HTML, no-JS visitors keep working links, and
// hydration doesn't shift a pixel. Once mounted, Leaflet owns the canvas and
// the poster unmounts.

import 'leaflet/dist/leaflet.css';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { Badge, EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { locationLineFor, titleFor, typeLabelFor, type MapItem } from '@/ui/opportunity';
import { CalendarIcon, MapPinIcon } from '@/ui/components/icons';
import {
  ALGERIA_BBOX,
  ALGERIA_RINGS,
  GEO_ATTRIBUTION,
  GEO_ATTRIBUTION_URL,
} from '@/ui/map/algeria-geo';

/** Canvas aspect — must match the container's `aspect-[4/3]`. */
const CANVAS_ASPECT = 4 / 3;
const LNG_SPAN = ALGERIA_BBOX.maxLng - ALGERIA_BBOX.minLng;

/**
 * Land tint — the jade brand at map strength (P11): identity without
 * shouting over the pins, which keep the saturated `bg-brand-600` dot. The
 * P3 stone grey was a placeholder; both the SSR poster and the live
 * overlay read these two constants so they can never drift apart.
 */
const LAND_FILL = 'rgba(20, 81, 60, 0.07)';
const LAND_STROKE = 'rgba(20, 81, 60, 0.45)';
/** Screen distance (px) at which two pins fold into one cluster badge. */
const CLUSTER_RADIUS_PX = 30;

/** WGS84 latitude → EPSG:3857 northing (radian units). */
function mercY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}
const MERC_MIN = mercY(ALGERIA_BBOX.minLat);
const MERC_SPAN = mercY(ALGERIA_BBOX.maxLat) - MERC_MIN;

/**
 * The geography's frame in canvas %: longitude span in radians against the
 * Mercator northing span, fitted by height and centred in width — no
 * distortion on a conformal projection. Leaflet's `fitBounds` of the same bbox
 * on this 4/3 canvas computes exactly this frame (zoomSnap 0 keeps it
 * continuous), which is what makes the SSR poster and the live overlay line up
 * pixel for pixel.
 */
const SHAPE_RATIO = (LNG_SPAN * Math.PI) / 180 / MERC_SPAN;
const FRAME_W = Math.min(100, SHAPE_RATIO * (100 / CANVAS_ASPECT));
const FRAME_X = (100 - FRAME_W) / 2;
/** Poster outline placement (full view) in poster viewBox units. */
const POSTER_TRANSFORM = `translate(${FRAME_X} 0) scale(${FRAME_W} 100)`;

/** WGS84 → frame fraction (0..1, y down) on the Mercator frame above. */
function toFrame(lat: number, lng: number): [number, number] {
  return [(lng - ALGERIA_BBOX.minLng) / LNG_SPAN, 1 - (mercY(lat) - MERC_MIN) / MERC_SPAN];
}

/** Stored rings are integer degrees × 100 → unit SVG path (evenodd keeps holes). */
function ringPath(ring: readonly number[]): string {
  let d = '';
  for (let i = 0; i < ring.length; i += 2) {
    const fx = (ring[i] / 100 - ALGERIA_BBOX.minLng) / LNG_SPAN;
    const fy = 1 - (mercY(ring[i + 1] / 100) - MERC_MIN) / MERC_SPAN;
    d += `${i === 0 ? 'M' : 'L'}${fx.toFixed(4)},${fy.toFixed(4)}`;
  }
  return `${d}Z`;
}

/** A point outside the bundled frame is bad data — never pin it anywhere. */
function inFrame(lat: number, lng: number): boolean {
  const [fx, fy] = toFrame(lat, lng);
  return fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1;
}

/** WGS84 → poster position in canvas % (full view = the Leaflet fit). */
function posterPos(lat: number, lng: number): { left: number; top: number } {
  const [fx, fy] = toFrame(lat, lng);
  return { left: FRAME_X + FRAME_W * fx, top: 100 * fy };
}

/** Escape text interpolated into the marker's HTML (titles come from the DB). */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Marker content — the same pin link markup the SSR poster renders. */
function pinHtml(title: string, href: string): string {
  return (
    `<a href="${esc(href)}" title="${esc(title)}" class="block">` +
    `<span aria-hidden="true" class="block size-3.5 rounded-full bg-brand-600 shadow-md ring-2 ring-white transition hover:scale-125 hover:bg-brand-800"></span>` +
    `<span class="sr-only">${esc(title)}</span></a>`
  );
}

/** Cluster badge content — count in brand-800 (deeper than the pin, so the
 *  hierarchy is scale, not hue) plus an sr-only label for screen readers. */
function clusterHtml(count: string, label: string): string {
  return (
    `<span aria-hidden="true" class="grid size-10 place-items-center rounded-full bg-brand-800 text-sm font-bold text-white tabular-nums shadow-md ring-2 ring-white transition hover:scale-110">${esc(count)}</span>` +
    `<span class="sr-only">${esc(label)}</span>`
  );
}

/**
 * Greedy screen-space grouping (P11): walk the points in order and pull every
 * unclaimed neighbour within `radius` px into the current group. Local
 * initiatives can be tens of kilometres apart yet a few pixels apart at
 * country zoom — without this the Algiers pins render as one overlapping blob.
 */
function groupByProximity<T>(
  items: readonly T[],
  project: (item: T) => { x: number; y: number },
  radius: number,
): T[][] {
  const claimed = new Set<number>();
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    if (claimed.has(i)) continue;
    claimed.add(i);
    const origin = project(items[i]);
    const group = [items[i]];
    for (let j = i + 1; j < items.length; j += 1) {
      if (claimed.has(j)) continue;
      const point = project(items[j]);
      if (Math.hypot(origin.x - point.x, origin.y - point.y) > radius) continue;
      claimed.add(j);
      group.push(items[j]);
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Initiative map (spec §16, P3 / RESEARCH H5, P6): pins and the bundled OSM
 * base geography (ODbL, attributed in the UI) live on a Leaflet map —
 * continuous-zoom EPSG:3857 with the bbox as a hard pan constraint — and the
 * side list stays the visible, keyboard-accessible alternative to every pin.
 */
export function InitiativeMap({
  locale,
  items: initialItems,
}: {
  locale: LocaleCode;
  items: MapItem[];
}) {
  const { dict } = getDictionary(locale);

  const [items, setItems] = useState(initialItems);
  const [searched, setSearched] = useState(false);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [total, setTotal] = useState(0);
  /** Leaflet mounted (poster hands the canvas over). */
  const [ready, setReady] = useState(false);
  /** Viewport is a subset of the full frame ("search this area" gate). */
  const [zoomed, setZoomed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const groupRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const boundsRef = useRef<Leaflet.LatLngBounds | null>(null);
  /** Zoom level that shows the whole frame — anything above is "zoomed". */
  const fullZoomRef = useRef(0);
  /** Hover/focus sync between the pins/clusters and the side list (P11). */
  const [hotId, setHotId] = useState<string | null>(null);
  /** Bumped on zoom/move — pins re-cluster in the new screen space (P11). */
  const [viewTick, setViewTick] = useState(0);
  /** item id → its live marker (a cluster registers under every member id). */
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  /** The side list — rows scroll into view when their pin is hot (P11). */
  const listRef = useRef<HTMLUListElement>(null);

  // A fresh server render (route/locale change) replaces viewport results.
  useEffect(() => setItems(initialItems), [initialItems]);

  // Drop rows without a point BEFORE Number(): Number(null) is 0, which would
  // silently pin an ungeocoded initiative at (0, 0) in the ocean.
  const points = useMemo(
    () =>
      items
        .filter((item) => item.latitude !== null && item.longitude !== null)
        .map((item) => ({ item, lat: Number(item.latitude), lng: Number(item.longitude) }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [items],
  );
  const paths = useMemo(() => ALGERIA_RINGS.map((ring) => ringPath(ring)), []);
  const mapShown = points.length > 0 || searched;

  /**
   * Fit the bbox and (re)apply the old engine's zoom contract: the full view
   * is the floor (you can't zoom out past it) and the range runs 1–8 — eight
   * levels, i.e. seven octaves of zoom-in — both relative to the current
   * fit, so a resize can move them in either direction. Also the reference
   * point for the "search this area" gate.
   */
  const applyFit = useCallback((map: Leaflet.Map, bounds: Leaflet.LatLngBounds): void => {
    // Release the current range first — getBoundsZoom clamps into it.
    map.setMinZoom(1);
    map.setMaxZoom(18);
    const full = map.getBoundsZoom(bounds);
    fullZoomRef.current = full;
    map.setMinZoom(full);
    map.setMaxZoom(full + 7);
    map.fitBounds(bounds, { animate: false });
    setZoomed(false); // covers any zoomend fired during the fit itself
  }, []);

  // One Leaflet instance per "canvas shown" period. The dynamic import keeps
  // leaflet (it touches window/document at module scope) off the server.
  useEffect(() => {
    if (!mapShown) return;
    let disposed = false;
    const handleResize = (): void => {
      const map = mapRef.current;
      const bounds = boundsRef.current;
      if (!map || !bounds) return;
      // At the full view the frame must keep fitting after a resize — the
      // old engine was percentage-based, so it always did.
      const wasFull = map.getZoom() <= fullZoomRef.current + 1e-6;
      map.invalidateSize({ animate: false });
      if (wasFull) applyFit(map, bounds);
    };
    window.addEventListener('resize', handleResize);
    void (async () => {
      const mod = await import('leaflet');
      if (disposed || !hostRef.current) return;
      // CJS interop: the bundler exposes `default` (module.exports) and the
      // named exports — either shape is the same Leaflet namespace.
      const leaflet = mod.default ?? mod;
      const bounds = leaflet.latLngBounds(
        [ALGERIA_BBOX.minLat, ALGERIA_BBOX.minLng],
        [ALGERIA_BBOX.maxLat, ALGERIA_BBOX.maxLng],
      );
      const map = leaflet.map(hostRef.current, {
        zoomControl: false, // the kit buttons own zooming
        attributionControl: false, // ODbL attribution below is ours
        scrollWheelZoom: false, // page scrolling stays with the page
        zoomSnap: 0, // continuous: fit == the poster frame, exactly
        // Instant like the old engine (and reduced-motion friendly).
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        // Wide until applyFit narrows it to the fit floor + 7 octaves.
        minZoom: 1,
        maxZoom: 18,
        // Hard pan constraint — the old clampView behaviour.
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
      });

      // Base geography: the same unit-frame paths the poster renders, pinned
      // to the bbox as an SVG overlay (evenodd keeps the holes).
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('viewBox', '0 0 1 1');
      svg.setAttribute('preserveAspectRatio', 'none');
      const outline = document.createElementNS(svgNs, 'g');
      outline.setAttribute('fill', LAND_FILL);
      outline.setAttribute('fill-rule', 'evenodd');
      outline.setAttribute('stroke', LAND_STROKE);
      outline.setAttribute('stroke-width', '1');
      outline.setAttribute('stroke-linejoin', 'round');
      for (const d of paths) {
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', d);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        outline.appendChild(path);
      }
      svg.appendChild(outline);
      leaflet.svgOverlay(svg, bounds).addTo(map);

      // Fit the frame, floor the zoom at it, arm the search-area gate.
      applyFit(map, bounds);

      const group = leaflet.layerGroup().addTo(map);
      // Zoom gates "search this area"; every view change also re-clusters the
      // pins in the new screen space (P11) — one bump feeds both.
      map.on('zoomend', () => {
        setZoomed(map.getZoom() > fullZoomRef.current + 1e-6);
        setViewTick((tick) => tick + 1);
      });
      map.on('moveend', () => setViewTick((tick) => tick + 1));

      boundsRef.current = bounds;
      mapRef.current = map;
      leafletRef.current = leaflet;
      groupRef.current = group;
      setReady(true);
    })();
    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      mapRef.current?.remove();
      boundsRef.current = null;
      mapRef.current = null;
      groupRef.current = null;
      leafletRef.current = null;
      setReady(false);
      setZoomed(false);
    };
  }, [mapShown, paths, applyFit]);

  // Keep the marker layer in sync with the results (initial + search-this-area),
  // grouped into proximity clusters in the current screen space (P11).
  useEffect(() => {
    const leaflet = leafletRef.current;
    const group = groupRef.current;
    const map = mapRef.current;
    if (!ready || !leaflet || !group || !map) return;
    group.clearLayers();
    markersRef.current.clear();

    const { dict } = getDictionary(locale);
    const visible = points.filter((point) => inFrame(point.lat, point.lng));
    const groups = groupByProximity(
      visible,
      (point) => {
        const container = map.latLngToContainerPoint([point.lat, point.lng]);
        return { x: container.x, y: container.y };
      },
      CLUSTER_RADIUS_PX,
    );

    for (const members of groups) {
      if (members.length === 1) {
        const point = members[0];
        const title = titleFor(point.item, locale);
        const marker = leaflet
          .marker([point.lat, point.lng], {
            icon: leaflet.divIcon({
              // Custom class: no `leaflet-div-icon` white box around the pin.
              className: 'bladna-pin',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
              html: pinHtml(title, `/${locale}/opportunities/${point.item.slug}`),
            }),
            // The pin link itself is the tab stop, exactly as before.
            keyboard: false,
            alt: title,
            riseOnHover: true,
          })
          .addTo(group);
        marker.on('mouseover', () => setHotId(point.item.id));
        marker.on('mouseout', () => setHotId(null));
        markersRef.current.set(point.item.id, marker);
        continue;
      }

      // Cluster badge — click (or Enter/Space) zooms until the pins split.
      const centerLat = members.reduce((sum, point) => sum + point.lat, 0) / members.length;
      const centerLng = members.reduce((sum, point) => sum + point.lng, 0) / members.length;
      const label = `${formatNumber(members.length, locale)} ${dict.landing.statsInitiatives}`;
      const marker = leaflet
        .marker([centerLat, centerLng], {
          icon: leaflet.divIcon({
            className: 'bladna-cluster',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            html: clusterHtml(formatNumber(members.length, locale), label),
          }),
          keyboard: false,
          title: label,
          riseOnHover: true,
          // Focus must never move the map under an active pointer: Leaflet's
          // auto-pan on focus fires a delayed `moveend` mid-click, which
          // re-clusters (detach + rebuild) between mousedown and mouseup and
          // swallows the click. The badge is on screen by construction.
          autoPanOnFocus: false,
        })
        .addTo(group);
      const zoomToMembers = (): void => {
        const bounds = leaflet.latLngBounds(
          members.map((point) => [point.lat, point.lng] as [number, number]),
        );
        if (map.getBoundsZoom(bounds) > map.getZoom() + 1e-6) {
          map.fitBounds(bounds, { padding: [56, 56], animate: false });
        } else {
          map.zoomIn();
        }
      };
      // Bind pointer + keyboard on the element itself: deterministic in every
      // browser (Leaflet's own click synthesis proved unreliable for divIcon
      // markers), and exactly one handler runs per activation.
      const element = marker.getElement();
      if (element) {
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', label);
        element.addEventListener('click', (event: MouseEvent) => {
          event.stopPropagation();
          zoomToMembers();
        });
        element.addEventListener('keydown', (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          zoomToMembers();
        });
      }
      for (const point of members) markersRef.current.set(point.item.id, marker);
    }
  }, [ready, points, locale, viewTick]);

  // Hover/focus sync (P11): a hot side-list row lights its pin (or cluster
  // badge); a hot pin scrolls its row into view — `block: nearest` makes the
  // already-visible case a no-op. Declared after the rebuild above so it runs
  // against the freshly created elements (same deps, later in the queue).
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      marker.getElement()?.classList.toggle('is-hot', id === hotId);
    }
    if (!hotId) return;
    listRef.current
      ?.querySelector(`[data-map-row="${hotId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [hotId, ready, points, viewTick]);

  if (!mapShown) {
    return <EmptyState>{dict.opportunity.noResults}</EmptyState>;
  }

  const zoomBy = (dir: 1 | -1): void => {
    const map = mapRef.current;
    if (!map) return;
    if (dir === 1) map.zoomIn();
    else map.zoomOut();
  };

  /** Reset the viewport — and with it any bounds-filtered results. */
  const reset = (): void => {
    const map = mapRef.current;
    if (map && boundsRef.current) applyFit(map, boundsRef.current);
    if (searched) {
      setItems(initialItems);
      setSearched(false);
      setStatus('idle');
    }
  };

  /** Re-query discover for whatever is inside the current viewport. */
  const searchArea = async (): Promise<void> => {
    const map = mapRef.current;
    if (!map) return;
    setStatus('searching');
    try {
      const bounds = map
        .getBounds()
        .toBBoxString()
        .split(',')
        .map((n) => Number(n).toFixed(4))
        .join(',');
      const response = await fetch(
        `/api/v1/opportunities?mode=map&sort=recent&limit=100&page=1&bounds=${encodeURIComponent(bounds)}`,
      );
      if (!response.ok) throw new Error(`discover ${response.status}`);
      const data = (await response.json()) as { items: MapItem[]; meta: { total: number } };
      setItems(data.items);
      setTotal(data.meta.total);
      setSearched(true);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div
        role="region"
        aria-label={dict.nav.map}
        data-testid="map-canvas"
        className="relative aspect-[4/3] touch-none overflow-hidden rounded-2xl border border-sand-200 bg-gradient-to-b from-sand-50 to-sand-100 lg:col-span-2"
      >
        {/* Decorative graticule (pure CSS, aria-hidden). */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(120,113,108,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,113,108,0.18) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Leaflet host — leaflet owns this div once mounted (its panes carry
            z-indexes up to 700, hence z-0: a stacking context so the kit
            overlays above stay on top). className never changes after mount,
            so React never clobbers leaflet's classes. */}
        <div ref={hostRef} className="absolute inset-0 z-0" />
        {/* SSR poster — bundled geography + pins in the Leaflet frame. Hidden
            once the engine takes over; the no-JS view keeps these links. */}
        {!ready && (
          <>
            <svg
              aria-hidden
              data-testid="map-outline"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              <g
                transform={POSTER_TRANSFORM}
                fill={LAND_FILL}
                fillRule="evenodd"
                stroke={LAND_STROKE}
                strokeWidth={1}
                strokeLinejoin="round"
              >
                {paths.map((d, index) => (
                  <path key={index} d={d} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            </svg>
            {points
              .filter((point) => inFrame(point.lat, point.lng))
              .map((point) => {
                const title = titleFor(point.item, locale);
                const pos = posterPos(point.lat, point.lng);
                return (
                  <Link
                    key={point.item.id}
                    href={`/${locale}/opportunities/${point.item.slug}`}
                    title={title}
                    className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                  >
                    <span
                      aria-hidden
                      className="block size-3.5 rounded-full bg-brand-600 shadow-md ring-2 ring-white transition hover:scale-125 hover:bg-brand-800"
                    />
                    <span className="sr-only">{title}</span>
                  </Link>
                );
              })}
          </>
        )}

        {/* Compass rose — a quiet atlas flourish parked in the frame's empty
            letterbox margin (physical left in both writing directions:
            geography never mirrors). Decorative only. */}
        <svg
          aria-hidden
          viewBox="0 0 48 48"
          fill="none"
          className="pointer-events-none absolute left-3 top-1/2 z-10 w-9 -translate-y-1/2 text-sand-500 opacity-60 sm:w-12"
        >
          <circle
            cx="24"
            cy="24"
            r="21"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <path
            d="M24 5 L27 21 L43 24 L27 27 L24 43 L21 27 L5 24 L21 21 Z"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <path d="M24 5 L27 21 L24 24 Z" fill="var(--color-clay-500)" />
        </svg>

        {points.length === 0 && (
          <p className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 text-center text-sm text-sand-600">
            {dict.opportunity.noResults}
          </p>
        )}

        {/* Map controls — kit sizing keeps every target ≥44px (RESEARCH H3). */}
        <div className="absolute right-2 top-2 z-20 flex flex-col gap-1" data-testid="map-controls">
          <button
            type="button"
            data-testid="map-zoom-in"
            aria-label={dict.opportunity.zoomIn}
            onClick={() => zoomBy(1)}
            className={buttonClasses({
              variant: 'outline',
              size: 'sm',
              className: 'w-11 px-0 shadow-sm',
            })}
          >
            <span aria-hidden className="text-base leading-none">
              +
            </span>
          </button>
          <button
            type="button"
            data-testid="map-zoom-out"
            aria-label={dict.opportunity.zoomOut}
            onClick={() => zoomBy(-1)}
            className={buttonClasses({
              variant: 'outline',
              size: 'sm',
              className: 'w-11 px-0 shadow-sm',
            })}
          >
            <span aria-hidden className="text-base leading-none">
              −
            </span>
          </button>
          <button
            type="button"
            data-testid="map-reset"
            aria-label={dict.opportunity.resetView}
            onClick={reset}
            className={buttonClasses({
              variant: 'outline',
              size: 'sm',
              className: 'w-11 px-0 shadow-sm',
            })}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>

        {/* Results chip — the permanent count on the start edge (P11): total
            while browsing, in-view after "search this area". The button sits
            directly under it so nothing ever covers the pins' north. */}
        <div className="absolute left-2 top-2 z-20 flex flex-col items-start gap-1">
          <p
            data-testid={searched ? 'map-in-view' : undefined}
            className="inline-flex items-center gap-1.5 rounded border border-sand-200 bg-white/90 px-2 py-1 text-xs text-sand-600 shadow-sm"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-brand-600" />
            {searched
              ? `${dict.opportunity.resultsInView}: ${formatNumber(items.length, locale)}` +
                (items.length < total ? ` ${dict.common.of} ${formatNumber(total, locale)}` : '')
              : dict.opportunity.resultsCount.replace(
                  '{count}',
                  formatNumber(items.length, locale),
                )}
          </p>

          {/* Search this area — only meaningful once the viewport is a subset. */}
          {zoomed && (
            <button
              type="button"
              data-testid="map-search-area"
              onClick={() => void searchArea()}
              disabled={status === 'searching'}
              className={buttonClasses({
                variant: 'outline',
                size: 'sm',
                className: 'shadow-sm',
              })}
            >
              {status === 'searching' ? dict.common.loading : dict.opportunity.searchThisArea}
            </button>
          )}
        </div>

        <div className="absolute bottom-2 left-2 z-20 flex flex-col items-start gap-1">
          {status === 'error' && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-white/95 px-2 py-1 text-xs text-red-700"
            >
              {dict.common.error}
            </p>
          )}
        </div>

        {/* ODbL attribution — physical bottom-right in both directions. */}
        <a
          href={GEO_ATTRIBUTION_URL}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="map-attribution"
          className="absolute bottom-2 right-2 z-10 rounded border border-sand-200 bg-white/85 px-1.5 py-0.5 text-[11px] leading-tight text-sand-500 transition hover:text-sand-700"
        >
          {GEO_ATTRIBUTION}
        </a>
      </div>

      {/* Visible alternative to the pins — keyboard accessible (spec §16).
          Each row carries place + date context (P11), and hovering/focusing
          one lights its pin (or cluster badge) on the canvas. */}
      {points.length === 0 ? (
        <p className="text-sm text-sand-600">{dict.opportunity.noResults}</p>
      ) : (
        <ul ref={listRef} className="max-h-[26rem] space-y-2 overflow-y-auto pe-1 lg:max-h-[34rem]">
          {points.map((point) => {
            const title = titleFor(point.item, locale);
            const location = locationLineFor(point.item, locale);
            const hot = hotId === point.item.id;
            return (
              <li key={point.item.id} data-map-row={point.item.id}>
                <Link
                  href={`/${locale}/opportunities/${point.item.slug}`}
                  onMouseEnter={() => setHotId(point.item.id)}
                  onMouseLeave={() => setHotId(null)}
                  onFocus={() => setHotId(point.item.id)}
                  onBlur={() => setHotId(null)}
                  className={`block rounded-lg border bg-white p-3 transition ${
                    hot
                      ? 'border-brand-300 shadow-md'
                      : 'border-sand-200 hover:border-brand-300 hover:shadow-sm'
                  }`}
                >
                  <span className="block font-medium leading-snug text-sand-900">{title}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sand-500">
                    <Badge>{typeLabelFor(point.item.type, dict)}</Badge>
                    {location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon className="size-3.5 text-sand-400" />
                        {location}
                      </span>
                    ) : null}
                    {point.item.startDate ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarIcon className="size-3.5 text-sand-400" />
                        {formatDate(point.item.startDate, locale)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

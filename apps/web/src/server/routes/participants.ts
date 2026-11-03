// Participant route table (Phase 2): volunteer self-service, organizations,
// verification, attendance, hours plus the new certificates, achievements,
// documents and public-verification modules.
//
// Integration note: this table must be registered alongside `coreRoutes` (and
// `platformRoutes`) in `app/api/v1/[[...segments]]/route.ts`
// (`router.register(participantRoutes)`). That file is shared and was
// intentionally left untouched by this module's author — see the hand-off
// report.
//
// Ordering: within each module, literal segments precede `:param` segments for
// every method (e.g. GET /certificates/verify before GET
// /certificates/:certificateId). Across modules the shapes never collide
// (segment counts and middle literals differ), and the duplicate check below
// fails loudly at import time if that ever regresses.

import { achievementRoutes } from '../modules/achievements';
import { attendanceRoutes } from '../modules/attendance';
import { certificateRoutes } from '../modules/certificates';
import { documentRoutes } from '../modules/documents';
import { hourRoutes } from '../modules/hours';
import { recommendationRoutes } from '../modules/matching';
import { organizationRoutes } from '../modules/organizations';
import { publicRoutes } from '../modules/public';
import { reviewRoutes } from '../modules/reviews';
import { savedRoutes } from '../modules/saved';
import { verificationRoutes } from '../modules/verification';
import { volunteerRoutes } from '../modules/volunteers';
import type { AppRoute } from '../router';

export const participantRoutes: AppRoute[] = [
  ...volunteerRoutes,
  ...organizationRoutes,
  ...verificationRoutes,
  ...attendanceRoutes,
  ...hourRoutes,
  ...certificateRoutes,
  ...achievementRoutes,
  ...documentRoutes,
  ...savedRoutes,
  ...reviewRoutes,
  ...recommendationRoutes,
  ...publicRoutes,
];

/** Two routes with the same method+path would silently shadow each other. */
function assertNoDuplicateRoutes(routes: AppRoute[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate route in participants table: ${key}`);
    }
    seen.add(key);
  }
}

assertNoDuplicateRoutes(participantRoutes);

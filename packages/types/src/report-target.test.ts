import { describe, expect, it } from 'vitest';
import { parseReportTargetRef } from './report-target';

/** P20 — pasted links/slugs resolve to the same target the form posts. */
describe('parseReportTargetRef', () => {
  it('detects an opportunity by slug from an absolute app URL', () => {
    expect(
      parseReportTargetRef('http://localhost:3002/en/opportunities/algiers-park-cleanup'),
    ).toEqual({ targetType: 'OPPORTUNITY', ref: 'algiers-park-cleanup' });
  });

  it('strips the locale segment and ignores query/hash noise', () => {
    expect(parseReportTargetRef('/ar/organizations/sahra-asso?tab=team#logo')).toEqual({
      targetType: 'ORGANIZATION',
      ref: 'sahra-asso',
    });
  });

  it('maps the workspace path to its organization', () => {
    expect(
      parseReportTargetRef('/en/workspace/0a88ce14-ba19-45e4-ac2a-1b75ea467f17/members'),
    ).toEqual({ targetType: 'ORGANIZATION', ref: '0a88ce14-ba19-45e4-ac2a-1b75ea467f17' });
  });

  it('maps campaign links (uuid in the URL) to CAMPAIGN', () => {
    expect(
      parseReportTargetRef('https://bladna.dz/en/campaigns/123e4567-e89b-12d3-a456-426614174000'),
    ).toEqual({ targetType: 'CAMPAIGN', ref: '123e4567-e89b-12d3-a456-426614174000' });
  });

  it('pulls the certificate number out of the verify link query', () => {
    expect(parseReportTargetRef('/en/verify/certificate?code=BLD-CERT-2LXHUMOJTJ')).toEqual({
      targetType: 'CERTIFICATE',
      ref: 'BLD-CERT-2LXHUMOJTJ',
    });
  });

  it('passes a bare uuid through untouched', () => {
    expect(parseReportTargetRef(' 669e91a9-bf1f-479d-9c49-2ee6c77094eb ')).toEqual({
      ref: '669e91a9-bf1f-479d-9c49-2ee6c77094eb',
    });
  });

  it('passes a bare slug (chosen type supplies the meaning) through', () => {
    expect(parseReportTargetRef('algiers-park-cleanup')).toEqual({
      ref: 'algiers-park-cleanup',
    });
  });

  it('passes an unmapped link through with no type hint', () => {
    expect(parseReportTargetRef('/en/international/123e4567-e89b-12d3-a456-426614174000')).toEqual({
      ref: '/en/international/123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('treats empty input as an empty reference', () => {
    expect(parseReportTargetRef('   ')).toEqual({ ref: '' });
  });
});

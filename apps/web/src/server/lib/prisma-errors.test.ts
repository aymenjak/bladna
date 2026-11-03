import { Prisma } from '@bladna/database';
import { describe, expect, it } from 'vitest';
import { isForeignKeyViolation, isRecordNotFound, isUniqueViolation } from './prisma-errors';

describe('prisma-errors', () => {
  it('matches a real PrismaClientKnownRequestError by class identity', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    expect(isUniqueViolation(error)).toBe(true);
    expect(isForeignKeyViolation(error)).toBe(false);
    expect(isRecordNotFound(error)).toBe(false);
  });

  it('matches by shape when the class identity differs (bundled runtime copy)', () => {
    // Simulates the Turbopack dual-instance case: identical fields, foreign
    // prototype — this is what `instanceof` rejected under next@16.3.6.
    const error = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    expect(isUniqueViolation(error)).toBe(true);
    expect(isForeignKeyViolation(error)).toBe(false);
    expect(isRecordNotFound(error)).toBe(false);
  });

  it('keeps the other Prisma codes distinct in both directions', () => {
    const foreignKey = Object.assign(new Error('FK'), {
      code: 'P2003',
      clientVersion: '6.19.3',
    });
    const recordNotFound = Object.assign(new Error('Gone'), {
      code: 'P2025',
      clientVersion: '6.19.3',
    });
    expect(isForeignKeyViolation(foreignKey)).toBe(true);
    expect(isUniqueViolation(foreignKey)).toBe(false);
    expect(isRecordNotFound(recordNotFound)).toBe(true);
    expect(isUniqueViolation(recordNotFound)).toBe(false);
  });

  it('rejects errors that are not Prisma known errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ code: 'P2002' })).toBe(false); // no clientVersion
    expect(isUniqueViolation({ code: 'conflict', clientVersion: '0' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });
});

import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AcceptMembershipTermsDto } from '../src/modules/membership/dto/accept-membership-terms.dto';
import { MembershipTermsService } from '../src/modules/membership/membership-terms.service';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

describe('MembershipTermsService', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const db = {
    withTransaction: jest.fn((work: (value: typeof client) => unknown) =>
      work(client),
    ),
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const service = new MembershipTermsService(db as never);

  beforeEach(() => {
    jest.clearAllMocks();
    db.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    client.query.mockResolvedValue({ rows: [] });
    db.query.mockResolvedValue({ rows: [{ accepted: false }] });
  });

  it('records the database-configured terms version for the authenticated user', async () => {
    const acceptedAt = new Date('2026-10-03T10:00:00.000Z');
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'program-id', terms_version: 'current-version' }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'acceptance-id',
          user_id: 'authenticated-user',
          membership_program_id: 'program-id',
          terms_version: 'current-version',
          accepted_at: acceptedAt,
        }],
      });

    const result = await service.acceptCurrentTerms(
      'authenticated-user',
      'program-id',
    );

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id, terms_version'),
      ['program-id'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ON CONFLICT (user_id, membership_program_id, terms_version)'),
      ['authenticated-user', 'program-id', 'current-version'],
    );
    expect(result).toEqual({
      id: 'acceptance-id',
      userId: 'authenticated-user',
      membershipProgramId: 'program-id',
      termsVersion: 'current-version',
      acceptedAt,
    });
  });

  it('returns the existing same-version acceptance without changing its accepted time', async () => {
    const originalAcceptedAt = new Date('2026-01-01T00:00:00.000Z');
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'program-id', terms_version: '1.0' }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'existing-acceptance',
          user_id: 'user-id',
          membership_program_id: 'program-id',
          terms_version: '1.0',
          accepted_at: originalAcceptedAt,
        }],
      });

    const result = await service.acceptCurrentTerms('user-id', 'program-id');

    expect(result.id).toBe('existing-acceptance');
    expect(result.acceptedAt).toBe(originalAcceptedAt);
    expect(String(client.query.mock.calls[1]?.[0])).toContain(
      'SET accepted_at = business_membership_terms_acceptances.accepted_at',
    );
  });

  it('does not record acceptance for a missing membership program', async () => {
    await expect(
      service.acceptCurrentTerms('user-id', 'missing-program'),
    ).rejects.toThrow(NotFoundException);

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('does not accept a client-supplied terms version in the request DTO', async () => {
    const request = Object.assign(new AcceptMembershipTermsDto(), {
      membershipProgramId: '123e4567-e89b-12d3-a456-426614174000',
      termsVersion: 'untrusted-version',
    });

    const errors = await validate(request, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toContain('termsVersion');
  });

  it('checks acceptance against the program current terms version', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ accepted: true }] });

    await expect(
      service.hasAcceptedCurrentTerms('user-id', 'program-id'),
    ).resolves.toBe(true);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'acceptance.terms_version = program.terms_version',
      ),
      ['user-id', 'program-id'],
    );
  });
});

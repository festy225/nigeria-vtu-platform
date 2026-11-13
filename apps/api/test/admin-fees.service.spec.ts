import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AdminFeesService } from '../src/modules/membership/admin-fees.service';

describe('AdminFeesService', () => {
  const client = {
    query: jest.fn(),
  };

  const db = {
    query: jest.fn(),
    withTransaction: jest.fn(),
  };

  const audit = {
    record: jest.fn(),
  };

  const service = new AdminFeesService(db as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();

    client.query.mockReset();
    db.query.mockReset();

    db.withTransaction.mockImplementation(
      async (work: (tx: typeof client) => Promise<unknown>) => work(client),
    );

    audit.record.mockResolvedValue(undefined);
  });

  it('rejects percentage fees above 10000 basis points before opening a transaction', async () => {
    await expect(
      service.createRule({
        feeCode: 'MARKETPLACE_COMMISSION',
        displayName: 'Marketplace commission',
        feeKind: 'PERCENTAGE',
        rateBasisPoints: 10001,
        currency: 'NGN',
        enabled: false,
      }, 'admin-id'),
    ).rejects.toThrow(BadRequestException);

    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('creates a valid fixed fee and records an audit entry in the transaction', async () => {
    const savedRule = {
      id: 'fee-rule-id',
      feeCode: 'ORDER_HANDLING',
      displayName: 'Order handling',
      feeKind: 'FIXED',
      amountMinor: '250',
      currency: 'NGN',
      enabled: false,
    };

    client.query.mockResolvedValueOnce({ rows: [savedRule] });

    const result = await service.createRule({
      feeCode: 'order_handling',
      displayName: 'Order handling',
      feeKind: 'FIXED',
      amountMinor: 250,
      currency: 'ngn',
      enabled: false,
    }, 'admin-id');

    expect(result).toEqual(savedRule);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(String(client.query.mock.calls[0][0])).toContain(
      'INSERT INTO platform_fee_rules',
    );
    expect(client.query.mock.calls[0][1]).toEqual([
      'ORDER_HANDLING',
      'Order handling',
      null,
      'FIXED',
      250,
      null,
      'NGN',
      null,
      null,
      null,
      false,
      null,
      null,
    ]);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-id',
        action: 'PLATFORM_FEE_RULE_CREATED',
        resourceType: 'platform_fee_rule',
        resourceId: 'fee-rule-id',
        beforeData: null,
        afterData: savedRule,
      }),
      client,
    );
  });

  it('rejects updating a membership program that does not exist', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateProgram('SELLER', {
        displayName: 'Seller',
        description: null,
        enabled: false,
        monthlyPriceMinor: null,
        annualPriceMinor: null,
        currency: 'NGN',
        termsVersion: 'v1',
        validityDuration: null,
        validityUnit: null,
      }, 'admin-id'),
    ).rejects.toThrow(NotFoundException);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lists Seller, Wholesaler, and Distributor configuration without filtering by enabled state', async () => {
    const programs = [
      { programCode: 'SELLER', enabled: false },
      { programCode: 'WHOLESALER', enabled: false },
      { programCode: 'DISTRIBUTOR', enabled: false },
    ];
    db.query.mockResolvedValueOnce({ rows: programs });

    await expect(service.listPrograms()).resolves.toEqual(programs);
    expect(db.query.mock.calls[0]?.[0]).toContain('FROM business_membership_programs program');
    expect(db.query.mock.calls[0]?.[0]).toContain('program.updated_at AS "updatedAt"');
    expect(db.query.mock.calls[0]?.[0]).toContain('SELECT program.id AS id');
    expect(db.query.mock.calls[0]?.[0]).not.toContain('WHERE enabled');
  });

  it.each(['SELLER', 'WHOLESALER', 'DISTRIBUTOR'])(
    'independently configures and audits the %s program',
    async (programCode) => {
      const saved = {
        id: `${programCode.toLowerCase()}-program-id`,
        programCode,
        enabled: true,
        termsAndConditions: 'Current terms',
      };
      client.query
        .mockResolvedValueOnce({ rows: [{ id: saved.id, enabled: false }] })
        .mockResolvedValueOnce({ rows: [saved] });

      await expect(
        service.updateProgram(programCode, {
          displayName: programCode,
          description: `${programCode} description`,
          enabled: true,
          monthlyPriceMinor: 1200,
          annualPriceMinor: 12000,
          currency: 'NGN',
          termsVersion: '2026-01',
          termsAndConditions: 'Current terms',
          validityDuration: null,
          validityUnit: null,
        }, 'super-admin-id'),
      ).resolves.toEqual(saved);

      const calls = client.query.mock.calls as Array<[string, unknown[]]>;
      expect(calls[1]?.[1]).toEqual([
        programCode,
        programCode,
        `${programCode} description`,
        true,
        1200,
        12000,
        'NGN',
        null,
        null,
        '2026-01',
        'Current terms',
        'super-admin-id',
      ]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'super-admin-id',
          action: 'MEMBERSHIP_PROGRAM_UPDATED',
          resourceId: saved.id,
          afterData: saved,
        }),
        client,
      );
    },
  );

  it('preserves the configured membership duration when the admin saves program settings', async () => {
    const saved = { id: 'seller-program-id', programCode: 'SELLER' };
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: saved.id,
          validity_duration: 6,
          validity_unit: 'MONTH',
          enabled: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [saved] });

    await service.updateProgram('SELLER', {
      displayName: 'Seller',
      enabled: true,
      monthlyPriceMinor: 1200,
      annualPriceMinor: 12000,
      currency: 'NGN',
      termsVersion: '2026-01',
      termsAndConditions: 'Current terms',
      validityDuration: 6,
      validityUnit: 'MONTH',
    }, 'super-admin-id');

    const calls = client.query.mock.calls as Array<[string, unknown[]]>;
    expect(calls[1]?.[1]).toEqual([
      'SELLER',
      'Seller',
      null,
      true,
      1200,
      12000,
      'NGN',
      6,
      'MONTH',
      '2026-01',
      'Current terms',
      'super-admin-id',
    ]);
    expect(calls[1]?.[0]).toContain(
      'WHERE program_code = $1',
    );
  });

  it('does not enable a program without configured terms and conditions', async () => {
    await expect(
      service.updateProgram('DISTRIBUTOR', {
        displayName: 'Distributor',
        enabled: true,
        monthlyPriceMinor: 100,
        annualPriceMinor: null,
        currency: 'NGN',
        termsVersion: 'v1',
        termsAndConditions: '',
      }, 'super-admin-id'),
    ).rejects.toThrow(BadRequestException);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it('filters membership payment history by any configured program and state', async () => {
    const item = { programCode: 'DISTRIBUTOR', state: 'SUCCESSFUL' };
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [item] });
    await expect(
      service.listMembershipPayments('distributor', 'successful'),
    ).resolves.toEqual({ items: [item], total: 1, limit: 50, offset: 0 });
    expect(db.query.mock.calls[0]?.[1]).toEqual(['DISTRIBUTOR', 'SUCCESSFUL']);
    expect(db.query.mock.calls[0]?.[0]).toContain("payment.purpose = 'BUSINESS_MEMBERSHIP'");
    expect(db.query.mock.calls[1]?.[1]).toEqual(['DISTRIBUTOR', 'SUCCESSFUL', 50, 0]);
  });

  it('validates payment history pagination bounds', async () => {
    await expect(
      service.listMembershipPayments(undefined, undefined, '101', '0'),
    ).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
});

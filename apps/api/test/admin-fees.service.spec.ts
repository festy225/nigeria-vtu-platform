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
});

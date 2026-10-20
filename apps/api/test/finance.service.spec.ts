import { BadRequestException, ConflictException } from '@nestjs/common';
import { FinanceService } from '../src/modules/finance/finance.service';

describe('FinanceService', () => {
  let service: FinanceService;
  let database: {
    query: jest.Mock;
    withTransaction: jest.Mock;
  };
  let audit: {
    record: jest.Mock;
  };

  beforeEach(() => {
    database = {
      query: jest.fn(),
      withTransaction: jest.fn(),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new FinanceService(database as any, audit as any);
  });

  describe('createAccount', () => {
    it('creates an account and audits using the same transaction client', async () => {
      const client = { query: jest.fn() };
      const account = {
        id: 'account-1',
        code: 'CASH-NGN',
        name: 'Cash',
        account_type: 'ASSET',
        currency: 'NGN',
        enabled: true,
        is_system: false,
      };

      client.query
        .mockResolvedValueOnce({ rows: [{ code: 'NGN' }] })
        .mockResolvedValueOnce({ rows: [account] });

      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      const result = await service.createAccount({
        code: ' cash-ngn ',
        name: ' Cash ',
        accountType: 'asset',
        currency: 'ngn',
      }, 'actor-1');

      expect(result).toEqual(account);
      expect(client.query).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-1',
          action: 'FINANCE_ACCOUNT_CREATED',
          resourceId: 'account-1',
        }),
        client,
      );
    });

    it('rejects a currency that is not enabled', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      await expect(service.createAccount({
        code: 'CASH-NGN',
        name: 'Cash',
        accountType: 'ASSET',
        currency: 'NGN',
      }, 'actor-1')).rejects.toBeInstanceOf(BadRequestException);

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('propagates audit failure so the transaction can roll back', async () => {
      const client = { query: jest.fn() };
      const auditError = new Error('audit unavailable');

      client.query
        .mockResolvedValueOnce({ rows: [{ code: 'NGN' }] })
        .mockResolvedValueOnce({ rows: [{
          id: 'account-1',
          code: 'CASH-NGN',
        }] });

      database.withTransaction.mockImplementation(
        async (work: any) => work(client),
      );
      audit.record.mockRejectedValueOnce(auditError);

      await expect(service.createAccount({
        code: 'CASH-NGN',
        name: 'Cash',
        accountType: 'ASSET',
        currency: 'NGN',
      }, 'actor-1')).rejects.toBe(auditError);
    });
  });

  describe('setAccountEnabled', () => {
    const accountId = '123e4567-e89b-42d3-a456-426614174000';

    it('updates status and audits within the same transaction', async () => {
      const client = { query: jest.fn() };
      const account = {
        id: accountId,
        code: 'CASH-NGN',
        name: 'Cash',
        account_type: 'ASSET',
        currency: 'NGN',
        enabled: false,
        is_system: false,
      };

      client.query
        .mockResolvedValueOnce({ rows: [{
          id: accountId,
          enabled: true,
          is_system: false,
        }] })
        .mockResolvedValueOnce({ rows: [account] });

      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      const result = await service.setAccountEnabled(
        accountId, false, 'actor-1',
      );

      expect(result).toEqual(account);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-1',
          action: 'FINANCE_ACCOUNT_DISABLED',
          resourceId: accountId,
        }),
        client,
      );
    });

    it('does not disable a system account', async () => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [{
          id: accountId,
          enabled: true,
          is_system: true,
        }] }),
      };

      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      await expect(service.setAccountEnabled(
        accountId, false, 'actor-1',
      )).rejects.toBeInstanceOf(ConflictException);

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects an invalid account ID before opening a transaction', async () => {
      await expect(service.setAccountEnabled(
        'not-a-uuid', false, 'actor-1',
      )).rejects.toBeInstanceOf(BadRequestException);

      expect(database.withTransaction).not.toHaveBeenCalled();
    });
  });
  describe('overview', () => {
    it('does not claim revenue or profit before accounting is reconciled', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [{ currency: 'NGN', status: 'SUCCESS', count: '2', amount_minor: '50000' }] })
        .mockResolvedValueOnce({ rows: [{ currency: 'NGN', status: 'SUCCESS', count: '1', amount_minor: '20000', fee_minor: '100', commission_minor: '50' }] })
        .mockResolvedValueOnce({ rows: [{ code: 'NGN', name: 'Nigerian Naira', minor_unit: 2, enabled: true, is_reporting_currency: false }] });

      const result = await service.overview();

      expect(result.accountingStatus).toBe('INCOMPLETE');
      expect(result.revenue).toBeNull();
      expect(result.profit).toBeNull();
      expect(result.currencies).toHaveLength(1);
      expect(result.paymentsByCurrencyAndStatus).toHaveLength(1);
      expect(result.airtimeByCurrencyAndStatus).toHaveLength(1);
    });
  });

  describe('recordExchangeRate', () => {
    const validInput = {
      baseCurrency: 'ngn',
      quoteCurrency: 'usd',
      rate: 0.00065,
      source: 'Approved finance source',
      effectiveAt: '2026-10-16T12:00:00.000Z',
      reason: 'Test rate',
    };

    it.each([
      [{ ...validInput, baseCurrency: 'NG', quoteCurrency: 'USD' }],
      [{ ...validInput, baseCurrency: 'NGN', quoteCurrency: 'NGN' }],
      [{ ...validInput, rate: 0 }],
      [{ ...validInput, rate: -1 }],
      [{ ...validInput, rate: Number.NaN }],
      [{ ...validInput, source: '   ' }],
      [{ ...validInput, effectiveAt: 'not-a-date' }],
    ])('rejects invalid input before opening a transaction', async (input) => {
      await expect(service.recordExchangeRate(input, 'actor-1'))
        .rejects.toBeInstanceOf(BadRequestException);

      expect(database.withTransaction).not.toHaveBeenCalled();
    });

    it('requires both currencies to exist and be enabled', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ code: 'NGN' }] }) };
      database.withTransaction.mockImplementation((work: (client: any) => Promise<unknown>) => work(client));

      await expect(service.recordExchangeRate(validInput, 'actor-1'))
        .rejects.toBeInstanceOf(BadRequestException);

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('records the rate and audit event in the same transaction', async () => {
      const insertedRow = {
        id: 'rate-1',
        base_currency: 'NGN',
        quote_currency: 'USD',
        rate: '0.000650000000',
        source: 'Approved finance source',
        recorded_by: 'actor-1',
      };

      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ code: 'NGN' }, { code: 'USD' }] })
          .mockResolvedValueOnce({ rows: [insertedRow] }),
      };

      database.withTransaction.mockImplementation((work: (client: any) => Promise<unknown>) => work(client));

      const result = await service.recordExchangeRate(validInput, 'actor-1');

      expect(result).toEqual(insertedRow);
      expect(database.withTransaction).toHaveBeenCalledTimes(1);
      expect(client.query).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-1',
          action: 'FINANCE_EXCHANGE_RATE_RECORDED',
          resourceType: 'finance_exchange_rate',
          resourceId: 'rate-1',
        }),
        client,
      );
    });
  });

  describe('postJournal', () => {
    const accountA = '11111111-1111-4111-8111-111111111111';
    const accountB = '22222222-2222-4222-8222-222222222222';
    const sourceId = '33333333-3333-4333-8333-333333333333';
    const journalId = '44444444-4444-4444-8444-444444444444';

    const input = {
      reference: 'FIN-TEST-001',
      sourceType: 'MANUAL_ADJUSTMENT',
      sourceId,
      currency: 'NGN',
      description: 'Finance journal test',
      postings: [
        {
          debitAccountId: accountA,
          creditAccountId: accountB,
          amountMinor: 100,
          description: 'First transfer',
        },
        {
          debitAccountId: accountB,
          creditAccountId: accountA,
          amountMinor: 50,
          description: 'Second transfer',
        },
      ],
    };

    it('posts a valid journal and audits within the same transaction', async () => {
      const client = { query: jest.fn() };
      const draft = {
        id: journalId,
        reference: input.reference,
        currency: 'NGN',
        status: 'DRAFT',
      };
      const posted = { ...draft, status: 'POSTED' };

      client.query
        .mockResolvedValueOnce({ rows: [{ code: 'NGN' }] })
        .mockResolvedValueOnce({
          rows: [{ id: accountA }, { id: accountB }],
        })
        .mockResolvedValueOnce({ rows: [draft] })
        .mockResolvedValueOnce({ rows: [{ id: 'posting-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'posting-2' }] })
        .mockResolvedValueOnce({ rows: [posted] });

      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      const result = await service.postJournal(input as any, 'actor-1');

      expect(result.journal).toEqual(posted);
      expect(result.postings).toHaveLength(2);
      expect(client.query).toHaveBeenCalledTimes(6);
      expect(audit.record).toHaveBeenCalled();
      expect(audit.record.mock.calls[0][1]).toBe(client);
    });

    it('rejects an invalid journal before opening a transaction', async () => {
      const invalidInput = {
        ...input,
        postings: [input.postings[0]],
      };

      await expect(
        service.postJournal(invalidInput as any, 'actor-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(database.withTransaction).not.toHaveBeenCalled();
    });

    it('maps a duplicate database reference to a conflict', async () => {
      const client = { query: jest.fn() };

      client.query
        .mockResolvedValueOnce({ rows: [{ code: 'NGN' }] })
        .mockResolvedValueOnce({
          rows: [{ id: accountA }, { id: accountB }],
        })
        .mockRejectedValueOnce({ code: '23505' });

      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      await expect(
        service.postJournal(input as any, 'actor-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('reverseJournal', () => {
    const accountA = '11111111-1111-4111-8111-111111111111';
    const accountB = '22222222-2222-4222-8222-222222222222';
    const journalId = '44444444-4444-4444-8444-444444444444';
    const reversalId = '55555555-5555-4555-8555-555555555555';

    const input = {
      reference: 'FIN-REV-001',
      reason: 'Correcting the original journal',
    };

    it('creates a reversal with debit and credit accounts swapped', async () => {
      const client = { query: jest.fn() };
      const original = {
        id: journalId,
        status: 'POSTED',
        currency: 'NGN',
        reference: 'FIN-ORIGINAL-001',
      };
      const originalPostings = [
        {
          id: 'posting-1',
          debit_account_id: accountA,
          credit_account_id: accountB,
          amount_minor: '100',
          description: 'First transfer',
        },
        {
          id: 'posting-2',
          debit_account_id: accountB,
          credit_account_id: accountA,
          amount_minor: '50',
          description: 'Second transfer',
        },
      ];
      const reversalDraft = {
        id: reversalId,
        reference: input.reference,
        currency: 'NGN',
        status: 'DRAFT',
      };
      const reversalPosted = {
        ...reversalDraft,
        status: 'POSTED',
      };
      const originalReversed = {
        ...original,
        status: 'REVERSED',
      };

      client.query
        .mockResolvedValueOnce({ rows: [original] })
        .mockResolvedValueOnce({ rows: originalPostings })
        .mockResolvedValueOnce({ rows: [reversalDraft] })
        .mockResolvedValueOnce({ rows: [{ id: 'reversal-posting-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'reversal-posting-2' }] })
        .mockResolvedValueOnce({ rows: [reversalPosted] })
        .mockResolvedValueOnce({ rows: [originalReversed] });

      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      const result = await service.reverseJournal(
        journalId,
        input as any,
        'actor-1',
      );

      expect(result.reversal).toEqual(reversalPosted);
      expect(result.journal).toEqual(originalReversed);
      expect(result.postings).toHaveLength(2);

      const firstReversalPostingArgs = client.query.mock.calls[3][1];
      expect(firstReversalPostingArgs).toContain(accountB);
      expect(firstReversalPostingArgs).toContain(accountA);

      expect(audit.record).toHaveBeenCalled();
      expect(audit.record.mock.calls[0][1]).toBe(client);
    });

    it('rejects reversing a journal that is not posted', async () => {
      const client = { query: jest.fn() };

      client.query.mockResolvedValueOnce({
        rows: [{
          id: journalId,
          status: 'REVERSED',
          currency: 'NGN',
        }],
      });

      database.withTransaction.mockImplementation(
        (work: any) => work(client),
      );

      await expect(
        service.reverseJournal(journalId, input as any, 'actor-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

});

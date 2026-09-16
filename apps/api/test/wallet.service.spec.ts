import { BadRequestException } from '@nestjs/common';
import { WalletService } from '../src/modules/wallets/wallet.service';

describe('WalletService financial invariants', () => {
  const client = { query: jest.fn() };
  const db = { withTransaction: jest.fn((work: (value: typeof client) => unknown) => work(client)), query: jest.fn() };
  const service = new WalletService(db as never);
  beforeEach(() => jest.clearAllMocks());

  it('rejects invalid amounts before touching the database', async () => {
    await expect(service.transfer('u1', 'w1', { destinationWalletId: 'w2', amountMinor: 0, currency: 'NGN', idempotencyKey: 'k' })).rejects.toThrow(BadRequestException);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects insufficient balance under the transaction lock', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'w1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'w2' }] })
      .mockResolvedValueOnce({ rows: [{ available_minor: '10' }] });
    await expect(service.transfer('u1', 'w1', { destinationWalletId: 'w2', amountMinor: 100, currency: 'NGN', idempotencyKey: 'k' })).rejects.toThrow('Insufficient wallet balance');
  });

  it('returns a stored response for a duplicate idempotency key', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ request_hash: 'wrong', response: { status: 'SUCCESSFUL' } }] });
    await expect(service.transfer('u1', 'w1', { destinationWalletId: 'w2', amountMinor: 100, currency: 'NGN', idempotencyKey: 'k' })).rejects.toThrow('Idempotency key was reused');
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../src/common/auth/auth.decorators';
import { FinanceController } from '../src/modules/finance/finance.controller';
import { FinanceService } from '../src/modules/finance/finance.service';

describe('FinanceController', () => {
  const finance = {
    overview: jest.fn(),
    listExchangeRates: jest.fn(),
    recordExchangeRate: jest.fn(),
  } as unknown as jest.Mocked<FinanceService>;

  let controller: FinanceController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FinanceController(finance);
  });

  it('requires the SUPER_ADMIN role at controller level', () => {
    const reflector = new Reflector();
    expect(
      reflector.get<string[]>(ROLES_KEY, FinanceController),
    ).toEqual(['SUPER_ADMIN']);
  });

  it('passes the authenticated subject as the audit actor', () => {
    const body = {
      baseCurrency: 'USD',
      quoteCurrency: 'NGN',
      rate: 1500,
      source: 'manual',
      effectiveAt: '2026-10-16T00:00:00.000Z',
    };
    const expected = { id: 'rate-id' };
    (finance.recordExchangeRate as jest.Mock).mockReturnValue(expected);

    const result = controller.recordExchangeRate(body, {
      user: { sub: 'admin-user-id' },
    } as never);

    expect(finance.recordExchangeRate).toHaveBeenCalledWith(
      body,
      'admin-user-id',
    );
    expect(result).toBe(expected);
  });

  it.each([
    [{ user: { sub: 'sub-id' } }, 'sub-id'],
    [{ user: { userId: 'user-id' } }, 'user-id'],
    [{ user: { id: 'id-value' } }, 'id-value'],
  ])('accepts supported authenticated user identifiers', (request, actorId) => {
    (finance.recordExchangeRate as jest.Mock).mockReturnValue('ok');

    controller.recordExchangeRate(
      {
        baseCurrency: 'USD',
        quoteCurrency: 'NGN',
        rate: 1500,
        source: 'manual',
        effectiveAt: '2026-10-16T00:00:00.000Z',
      },
      request as never,
    );

    expect(finance.recordExchangeRate).toHaveBeenCalledWith(
      expect.any(Object),
      actorId,
    );
  });

  it('rejects a request without an authenticated user identifier', () => {
    expect(() =>
      controller.recordExchangeRate(
        {
          baseCurrency: 'USD',
          quoteCurrency: 'NGN',
          rate: 1500,
          source: 'manual',
          effectiveAt: '2026-10-16T00:00:00.000Z',
        },
        { user: { roles: ['SUPER_ADMIN'] } } as never,
      ),
    ).toThrow(UnauthorizedException);

    expect(finance.recordExchangeRate).not.toHaveBeenCalled();
  });
});

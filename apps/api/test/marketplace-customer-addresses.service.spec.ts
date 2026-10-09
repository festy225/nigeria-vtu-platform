import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { MarketplaceCustomerAddressesService } from '../src/modules/marketplace-customer-addresses/marketplace-customer-addresses.service';

describe('MarketplaceCustomerAddressesService', () => {
  const transaction = {
    query: jest.fn(),
  };

  const database = {
    query: jest.fn(),
    withTransaction: jest.fn(),
  };

  let service: MarketplaceCustomerAddressesService;

  const addressRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'address-1',
    customer_id: 'user-1',
    label: 'Home',
    recipient_name: 'Test Customer',
    recipient_phone: '08012345678',
    address_line1: '1 Test Street',
    address_line2: null,
    city: 'Lagos',
    state_province: 'Lagos',
    postal_code: null,
    country_code: 'NG',
    latitude: null,
    longitude: null,
    is_default: false,
    enabled: true,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const createDto = (overrides: Record<string, unknown> = {}) =>
    ({
      label: 'Home',
      recipientName: 'Test Customer',
      recipientPhone: '08012345678',
      addressLine1: '1 Test Street',
      city: 'Lagos',
      countryCode: 'ng',
      ...overrides,
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();

    database.withTransaction.mockImplementation(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    );

    service = new MarketplaceCustomerAddressesService(
      database as never,
    );
  });

  describe('list', () => {
    it('returns enabled addresses for the specified customer', async () => {
      database.query.mockResolvedValueOnce({
        rows: [addressRow()],
        rowCount: 1,
      });

      const result = await service.list('user-1');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'WHERE customer_id = $1 AND enabled = true',
        ),
        ['user-1'],
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'address-1',
        countryCode: 'NG',
      });
    });
  });

  describe('create', () => {
    it('normalizes the country code to uppercase', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [addressRow()],
          rowCount: 1,
        });

      await service.create('user-1', createDto());

      expect(transaction.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO marketplace_customer_addresses'),
        expect.arrayContaining(['NG']),
      );
    });

    it('clears the previous default when creating a default address', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [addressRow({ is_default: true })],
          rowCount: 1,
        });

      await service.create(
        'user-1',
        createDto({ isDefault: true }),
      );

      expect(transaction.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SET is_default = false'),
        ['user-1'],
      );

      const insertArgs = transaction.query.mock.calls[2][1];
      expect(insertArgs[insertArgs.length - 1]).toBe(true);
    });

    it('rejects an invalid country code', async () => {
      await expect(
        service.create(
          'user-1',
          createDto({ countryCode: 'NGA' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(database.withTransaction).not.toHaveBeenCalled();
    });

    it('rejects coordinates when only latitude is supplied', async () => {
      await expect(
        service.create(
          'user-1',
          createDto({ latitude: 6.5244 }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(database.withTransaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('preserves existing fields when updating only the city', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [addressRow()],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [addressRow({ city: 'Abuja' })],
          rowCount: 1,
        });

      await service.update('user-1', 'address-1', {
        city: 'Abuja',
      });

      const updateArgs = transaction.query.mock.calls[2][1];

      expect(updateArgs).toEqual([
        'Home',
        'Test Customer',
        '08012345678',
        '1 Test Street',
        null,
        'Abuja',
        'Lagos',
        null,
        'NG',
        null,
        null,
        false,
        'address-1',
        'user-1',
      ]);
    });

    it('clears the previous default when setting an address as default', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [addressRow()],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [addressRow({ is_default: true })],
          rowCount: 1,
        });

      await service.update('user-1', 'address-1', {
        isDefault: true,
      });

      expect(transaction.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('SET is_default = false'),
        ['user-1'],
      );

      const updateArgs = transaction.query.mock.calls[3][1];
      expect(updateArgs[11]).toBe(true);
    });

    it('rejects an empty update', async () => {
      await expect(
        service.update('user-1', 'address-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(database.withTransaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the address belongs to another customer', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        });

      await expect(
        service.update('user-1', 'address-2', {
          city: 'Abuja',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('disable', () => {
    it('soft-disables the address without physically deleting it', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            addressRow({
              enabled: false,
              is_default: false,
            }),
          ],
          rowCount: 1,
        });

      const result = await service.disable('user-1', 'address-1');

      expect(transaction.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SET enabled = false'),
        ['address-1', 'user-1'],
      );
      expect(result).toMatchObject({
        disabled: true,
        address: {
          id: 'address-1',
          isDefault: false,
        },
      });
    });

    it('clears both enabled and is_default when disabling an address', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [addressRow({ enabled: false, is_default: false })],
          rowCount: 1,
        });

      await service.disable('user-1', 'address-1');

      const updateSql = transaction.query.mock.calls[1][0];

      expect(updateSql).toContain('SET enabled = false');
      expect(updateSql).toContain('is_default = false');
      expect(transaction.query.mock.calls[1][1]).toEqual([
        'address-1',
        'user-1',
      ]);
    });

    it('throws NotFoundException when the address cannot be disabled for this customer', async () => {
      transaction.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        });

      await expect(
        service.disable('user-1', 'address-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

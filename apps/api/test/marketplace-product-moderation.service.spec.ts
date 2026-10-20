import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SellerService } from '../src/modules/sellers/seller.service';
import type { ReviewMarketplaceProductDto } from '../src/modules/sellers/dto/review-marketplace-product.dto';

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
};

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<QueryResult>;

describe('SellerService marketplace product moderation', () => {
  const transactionClient = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };

  const database = {
    withTransaction: jest.fn(
      (work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
    ),
  };

  const audit = { record: jest.fn() };
  const service = new SellerService(database as never, audit as never);

  const product = (overrides: Record<string, unknown> = {}) => ({
    id: 'product-id',
    status: 'SUBMITTED',
    enabled: false,
    onboarding_status: 'APPROVED',
    kyc_status: 'VERIFIED',
    risk_status: 'NORMAL',
    category_enabled: true,
    has_base_price: true,
    has_valid_variant_price: false,
    ...overrides,
  });

  const moderate = (
    decision: ReviewMarketplaceProductDto['decision'],
    reviewNote?: string,
  ) =>
    service.moderateProduct('product-id', 'admin-id', {
      decision,
      reviewNote,
    });

  beforeEach(() => {
    transactionClient.query.mockReset();
    database.withTransaction.mockReset().mockImplementation(
      (work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
    );
    audit.record.mockReset().mockResolvedValue(undefined);
  });

  it('moves a submitted product into review and records the audit event', async () => {
    transactionClient.query
      .mockResolvedValueOnce({ rows: [product()], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: 'product-id', status: 'UNDER_REVIEW', enabled: false }],
        rowCount: 1,
      });

    await expect(moderate('START_REVIEW', '  Check product details  ')).resolves.toEqual({
      id: 'product-id',
      status: 'UNDER_REVIEW',
      enabled: false,
    });

    expect(transactionClient.query).toHaveBeenCalledTimes(2);
    expect(transactionClient.query.mock.calls[1]?.[1]).toEqual([
      'UNDER_REVIEW',
      false,
      'product-id',
      'SUBMITTED',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-id',
        action: 'MARKETPLACE_PRODUCT_MODERATED',
        resourceType: 'MARKETPLACE_PRODUCT',
        resourceId: 'product-id',
        reason: 'Check product details',
      }),
      transactionClient,
    );
  });

  it('publishes an approved product with valid variant pricing', async () => {
    transactionClient.query
      .mockResolvedValueOnce({
        rows: [product({
          status: 'APPROVED',
          has_base_price: false,
          has_valid_variant_price: true,
        })],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'product-id', status: 'LIVE', enabled: true }],
        rowCount: 1,
      });

    await expect(moderate('PUBLISH')).resolves.toEqual({
      id: 'product-id',
      status: 'LIVE',
      enabled: true,
    });

    expect(transactionClient.query.mock.calls[1]?.[1]).toEqual([
      'LIVE',
      true,
      'product-id',
      'APPROVED',
    ]);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('rejects publication when seller eligibility requirements fail', async () => {
    transactionClient.query.mockResolvedValueOnce({
      rows: [product({ status: 'APPROVED', kyc_status: 'PENDING' })],
      rowCount: 1,
    });

    await expect(moderate('PUBLISH')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(transactionClient.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a decision that is not allowed for the current status', async () => {
    transactionClient.query.mockResolvedValueOnce({
      rows: [product({ status: 'SUBMITTED' })],
      rowCount: 1,
    });

    await expect(moderate('PUBLISH')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(transactionClient.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('returns not found when the product does not exist', async () => {
    transactionClient.query.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    await expect(moderate('APPROVE')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(transactionClient.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects publication when the category is disabled', async () => {
    transactionClient.query.mockResolvedValueOnce({
      rows: [product({ status: 'APPROVED', category_enabled: false })],
      rowCount: 1,
    });

    await expect(moderate('PUBLISH')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(transactionClient.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
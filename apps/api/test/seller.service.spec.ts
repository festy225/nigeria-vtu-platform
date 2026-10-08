import { ForbiddenException } from '@nestjs/common';
import { SellerService } from '../src/modules/sellers/seller.service';
import type { ReviewSellerApplicationDto } from '../src/modules/sellers/seller.dtos';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}>;

describe('SellerService membership eligibility', () => {
  const transactionClient = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const database = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
    withTransaction: jest.fn((work: (client: typeof transactionClient) => unknown) =>
      work(transactionClient),
    ),
  };
  const audit = { record: jest.fn() };
  const service = new SellerService(database as never, audit as never);
  const sellerApplication = {
    sellerType: 'RETAILER' as const,
    businessName: 'Example Business',
    storeName: 'Example Store',
    storeSlug: 'example-store',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    database.query.mockResolvedValue({ rows: [], rowCount: 0 });
    database.withTransaction.mockImplementation(
      (work: (client: typeof transactionClient) => unknown) =>
        work(transactionClient),
    );
    transactionClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    audit.record.mockResolvedValue(undefined);
  });

  const setEligibility = (eligible: boolean) => {
    database.query.mockResolvedValueOnce({
      rows: [{ eligible }],
      rowCount: 1,
    });
  };

  it('allows an active, unexpired SELLER entitlement with current terms acceptance', async () => {
    setEligibility(true);

    await expect(
      service.isSellerApplicationEligible('user-id'),
    ).resolves.toBe(true);

    const [query, values] = database.query.mock.calls[0]!;
    expect(query).toContain("program.program_code = 'SELLER'");
    expect(query).toContain('program.enabled = true');
    expect(query).toContain("entitlement.status = 'ACTIVE'");
    expect(query).toMatch(
      /entitlement\.expires_at IS NULL\s+OR entitlement\.expires_at > now\(\)/,
    );
    expect(query).toContain(
      'acceptance.terms_version = program.terms_version',
    );
    expect(values).toEqual(['user-id']);
  });

  it.each([
    ['no entitlement', false],
    ['a non-active entitlement', false],
    ['an expired entitlement', false],
    ['acceptance of an old terms version only', false],
    ['a disabled SELLER program', false],
    ['a WHOLESALER entitlement only', false],
    ['a DISTRIBUTOR entitlement only', false],
  ])('rejects eligibility when there is %s', async (_description, eligible) => {
    setEligibility(eligible);

    await expect(
      service.isSellerApplicationEligible('user-id'),
    ).resolves.toBe(false);

    expect(database.query.mock.calls[0]?.[0]).toContain(
      "program.program_code = 'SELLER'",
    );
    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id']);
  });

  it('allows a non-expiring active entitlement with current terms', async () => {
    setEligibility(true);

    await expect(
      service.isSellerApplicationEligible('user-id'),
    ).resolves.toBe(true);
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'entitlement.expires_at IS NULL',
    );
  });

  it('blocks application submission before querying or changing application records when ineligible', async () => {
    setEligibility(false);

    await expect(
      service.createApplication('authenticated-user-id', sellerApplication),
    ).rejects.toThrow(ForbiddenException);

    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls[0]?.[1]).toEqual([
      'authenticated-user-id',
    ]);
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'business_membership_entitlements',
    );
  });

  it('continues the existing application submission flow when eligible', async () => {
    setEligibility(true);
    database.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'seller-id',
          user_id: 'authenticated-user-id',
          onboarding_status: 'SUBMITTED',
          kyc_status: 'PENDING',
        }],
        rowCount: 1,
      });

    const result = await service.createApplication(
      'authenticated-user-id',
      sellerApplication,
    );

    expect(result).toMatchObject({
      id: 'seller-id',
      user_id: 'authenticated-user-id',
      onboarding_status: 'SUBMITTED',
      kyc_status: 'PENDING',
    });
    expect(database.query).toHaveBeenCalledTimes(4);
    const insert = database.query.mock.calls[3]?.[0] ?? '';
    expect(insert).toContain('INSERT INTO marketplace_sellers');
    expect(insert).not.toMatch(/roles|user_roles|business_membership_entitlements/i);
  });

  it('does not inspect or update roles, seller type, KYC, or approval state for eligibility', async () => {
    setEligibility(true);

    await service.isSellerApplicationEligible('authenticated-user-id');

    const query = database.query.mock.calls[0]?.[0] ?? '';
    expect(query).not.toMatch(
      /roles|user_roles|seller_type|kyc_status|onboarding_status|reviewed_by/i,
    );
  });

  it.each([
    ['APPROVE', 'SUBMITTED', 'APPROVED'],
    ['REJECT', 'SUBMITTED', 'REJECTED'],
    ['MORE_INFORMATION_REQUIRED', 'SUBMITTED', 'MORE_INFORMATION_REQUIRED'],
    ['START_REVIEW', 'SUBMITTED', 'UNDER_REVIEW'],
    ['APPROVE', 'UNDER_REVIEW', 'APPROVED'],
    ['REJECT', 'MORE_INFORMATION_REQUIRED', 'REJECTED'],
  ] as const)(
    'applies %s from %s and stores %s using the existing review fields',
    async (decision, currentStatus, nextStatus) => {
      const dto: ReviewSellerApplicationDto = {
        decision,
        reviewNote: 'Review note',
      };
      const reviewedAt = new Date('2026-10-03T11:00:00.000Z');
      transactionClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'application-id',
            user_id: 'applicant-id',
            onboarding_status: currentStatus,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'application-id',
            user_id: 'applicant-id',
            onboarding_status: nextStatus,
            reviewed_by: 'super-admin-id',
            reviewed_at: reviewedAt,
          }],
        });

      const result = await service.reviewApplication(
        'application-id',
        'super-admin-id',
        dto,
      );

      expect(result).toMatchObject({
        id: 'application-id',
        onboarding_status: nextStatus,
        reviewed_by: 'super-admin-id',
        reviewed_at: reviewedAt,
      });
      const update = transactionClient.query.mock.calls[1];
      expect(update?.[0]).toContain('reviewed_by = $2');
      expect(update?.[0]).toContain('reviewed_at = now()');
      expect(update?.[0]).not.toMatch(/kyc_status|seller_type|role|entitlement/i);
      expect(update?.[1]).toEqual([
        nextStatus,
        'super-admin-id',
        'application-id',
        currentStatus,
      ]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'super-admin-id',
          action: 'SELLER_APPLICATION_REVIEWED',
          resourceType: 'MARKETPLACE_SELLER_APPLICATION',
          resourceId: 'application-id',
          beforeData: { onboardingStatus: currentStatus },
          afterData: expect.objectContaining({
            onboardingStatus: nextStatus,
            reviewedBy: 'super-admin-id',
            decision,
          }),
          reason: 'Review note',
        }),
        transactionClient,
      );
    },
  );

  it('does not review a nonexistent application', async () => {
    transactionClient.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.reviewApplication('missing-id', 'super-admin-id', {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow('Seller application not found');

    expect(transactionClient.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const)(
    'rejects reviewing an application in terminal or non-reviewable %s status',
    async (status) => {
      transactionClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'application-id',
          user_id: 'applicant-id',
          onboarding_status: status,
        }],
      });

      await expect(
        service.reviewApplication('application-id', 'super-admin-id', {
          decision: 'APPROVE',
        }),
      ).rejects.toThrow('Cannot apply decision');

      expect(transactionClient.query).toHaveBeenCalledTimes(1);
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('prevents stale concurrent review updates and audits only successful changes', async () => {
    transactionClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'application-id',
          user_id: 'applicant-id',
          onboarding_status: 'SUBMITTED',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.reviewApplication('application-id', 'super-admin-id', {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow('Seller application changed while it was being reviewed');

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('creates a seller location using the authenticated seller identity', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{ id: 'seller-id' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'location-id',
          seller_id: 'seller-id',
          location_name: 'Main Warehouse',
          contact_name: 'Seller Contact',
          contact_phone: '+2348012345678',
          address_line1: '10 Market Road',
          address_line2: null,
          city: 'Lagos',
          state_province: 'Lagos',
          postal_code: '100001',
          country_code: 'NG',
          latitude: 6.5244,
          longitude: 3.3792,
          is_default: true,
          enabled: true,
        }],
        rowCount: 1,
      });

    const result = await service.createSellerLocation('user-id', {
      locationName: 'Main Warehouse',
      contactName: 'Seller Contact',
      contactPhone: '+2348012345678',
      addressLine1: '10 Market Road',
      city: 'Lagos',
      stateProvince: 'Lagos',
      postalCode: '100001',
      countryCode: 'NG',
      latitude: 6.5244,
      longitude: 3.3792,
      isDefault: true,
    });

    expect(result).toMatchObject({
      id: 'location-id',
      seller_id: 'seller-id',
      location_name: 'Main Warehouse',
      country_code: 'NG',
      is_default: true,
      enabled: true,
    });

    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id']);

    const insert = database.query.mock.calls[1]?.[0] ?? '';
    expect(insert).toContain(
      'INSERT INTO marketplace_seller_locations',
    );
    expect(database.query.mock.calls[1]?.[1]).toEqual([
      'seller-id',
      'Main Warehouse',
      'Seller Contact',
      '+2348012345678',
      '10 Market Road',
      null,
      'Lagos',
      'Lagos',
      '100001',
      'NG',
      6.5244,
      3.3792,
      true,
    ]);
  });

  it('lists only enabled locations belonging to the authenticated seller', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{ id: 'seller-id' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'location-id',
          seller_id: 'seller-id',
          location_name: 'Main Warehouse',
          city: 'Lagos',
          country_code: 'NG',
          is_default: true,
          enabled: true,
        }],
        rowCount: 1,
      });

    const result = await service.listSellerLocations('user-id');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'location-id',
        seller_id: 'seller-id',
        location_name: 'Main Warehouse',
        is_default: true,
        enabled: true,
      }),
    ]);

    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id']);

    const listQuery = database.query.mock.calls[1]?.[0] ?? '';
    expect(listQuery).toContain(
      'FROM marketplace_seller_locations',
    );
    expect(listQuery).toContain('WHERE seller_id = $1');
    expect(listQuery).toContain('AND enabled = true');
    expect(listQuery).toContain(
      'ORDER BY is_default DESC, created_at DESC, id',
    );
    expect(database.query.mock.calls[1]?.[1]).toEqual(['seller-id']);
  });

  it('lists orders containing the authenticated seller items', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{ id: 'seller-id' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-id',
          order_number: '1001',
          status: 'PLACED',
          currency: 'NGN',
          subtotal_minor: '150000',
          total_minor: '150000',
          item_count: '2',
          seller_total_minor: '125000',
          created_at: new Date('2026-10-08T10:00:00.000Z'),
          updated_at: new Date('2026-10-08T10:05:00.000Z'),
        }],
        rowCount: 1,
      });

    const result = await service.listSellerOrders('user-id');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'order-id',
        orderNumber: '1001',
        status: 'PLACED',
        currency: 'NGN',
        subtotalMinor: 150000,
        totalMinor: 150000,
        itemCount: 2,
        sellerTotalMinor: 125000,
      }),
    ]);

    expect(result[0]).not.toHaveProperty('customerId');
    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id']);

    const listQuery = database.query.mock.calls[1]?.[0] ?? '';
    expect(listQuery).toContain('FROM marketplace_orders o');
    expect(listQuery).toContain('JOIN marketplace_order_items item');
    expect(listQuery).toContain('item.seller_id = $1');
    expect(database.query.mock.calls[1]?.[1]).toEqual(['seller-id']);
  });
});

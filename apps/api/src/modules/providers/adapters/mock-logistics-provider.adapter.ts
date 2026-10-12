import type {
  CheckLogisticsServiceabilityRequest,
  CheckLogisticsServiceabilityResponse,
  FindLogisticsOfficesRequest,
  FindLogisticsOfficesResponse,
  BookLogisticsShipmentRequest,
  BookLogisticsShipmentResponse,
  LookupLogisticsBookingRequest,
  LookupLogisticsBookingResponse,
  LogisticsProvider,
} from '../interfaces/logistics-provider.interface';

export class MockLogisticsProviderAdapter implements LogisticsProvider {
  readonly name = 'mock-logistics';
  readonly runtimeMode = 'test-only' as const;

  private readonly bookings = new Map<string, string>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async checkServiceability(
    request: CheckLogisticsServiceabilityRequest,
  ): Promise<CheckLogisticsServiceabilityResponse> {
    return {
      serviceable:
        request.origin.countryCode === request.destination.countryCode,
      rawPayload: {
        provider: this.name,
        originCountry: request.origin.countryCode,
        destinationCountry: request.destination.countryCode,
      },
    };
  }

  async findOffices(
    request: FindLogisticsOfficesRequest,
  ): Promise<FindLogisticsOfficesResponse> {
    return {
      offices: [],
      rawPayload: {
        provider: this.name,
        originCountry: request.origin.countryCode,
        destinationCountry: request.destination.countryCode,
        radiusKm: request.radiusKm ?? null,
      },
    };
  }

  async trackShipment(
    request: import('../interfaces/logistics-provider.interface').TrackLogisticsShipmentRequest,
  ): Promise<import('../interfaces/logistics-provider.interface').TrackLogisticsShipmentResponse> {
    return {
      status: 'IN_TRANSIT',
      events: [
        {
          providerEventId: `mock-${request.trackingReference}-in-transit`,
          status: 'IN_TRANSIT',
          providerStatus: 'SIMULATED_IN_TRANSIT',
          description: 'Simulated tracking update from the test-only logistics provider.',
          occurredAt: new Date().toISOString(),
          metadata: { simulated: true },
        },
      ],
      rawPayload: {
        provider: this.name,
        simulated: true,
        trackingReference: request.trackingReference,
      },
    };
  }

  async bookShipment(
    request: BookLogisticsShipmentRequest,
  ): Promise<BookLogisticsShipmentResponse> {
    // Simulate provider-side idempotency for tests.
    const stableReference =
      this.bookings.get(request.idempotencyKey) ??
      `MOCK-${request.idempotencyKey}`;
    this.bookings.set(request.idempotencyKey, stableReference);

    return {
      trackingReference: stableReference,
      rawPayload: {
        provider: this.name,
        selectedOfficeId: request.selectedOffice.providerOfficeId,
        originCountry: request.origin.countryCode,
        destinationCountry: request.destination.countryCode,
      },
    };
  }

  async lookupBooking(
    request: LookupLogisticsBookingRequest,
  ): Promise<LookupLogisticsBookingResponse> {
    const trackingReference = this.bookings.get(request.idempotencyKey);

    if (!trackingReference) {
      return {
        status: 'NOT_FOUND',
        rawPayload: { provider: this.name, simulated: true },
      };
    }

    return {
      status: 'FOUND',
      trackingReference,
      rawPayload: {
        provider: this.name,
        simulated: true,
        idempotencyKey: request.idempotencyKey,
      },
    };
  }
}

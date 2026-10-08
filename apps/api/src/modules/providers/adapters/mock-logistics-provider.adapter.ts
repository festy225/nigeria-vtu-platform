import type {
  CheckLogisticsServiceabilityRequest,
  CheckLogisticsServiceabilityResponse,
  FindLogisticsOfficesRequest,
  FindLogisticsOfficesResponse,
  LogisticsProvider,
} from '../interfaces/logistics-provider.interface';

export class MockLogisticsProviderAdapter implements LogisticsProvider {
  readonly name = 'mock-logistics';
  readonly runtimeMode = 'test-only' as const;

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
}

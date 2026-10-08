export interface LogisticsLocation {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface LogisticsPackage {
  quantity: number;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

export interface CheckLogisticsServiceabilityRequest {
  origin: LogisticsLocation;
  destination: LogisticsLocation;
  packages: LogisticsPackage[];
}

export interface CheckLogisticsServiceabilityResponse {
  serviceable: boolean;
  rawPayload?: unknown;
}

export interface LogisticsProvider {
  readonly name: string;
  readonly runtimeMode: 'production' | 'test-only';

  isAvailable(): Promise<boolean>;

  checkServiceability(
    request: CheckLogisticsServiceabilityRequest,
  ): Promise<CheckLogisticsServiceabilityResponse>;

  findOffices(
    request: FindLogisticsOfficesRequest,
  ): Promise<FindLogisticsOfficesResponse>;

  bookShipment(
    request: BookLogisticsShipmentRequest,
  ): Promise<BookLogisticsShipmentResponse>;
}

export interface LogisticsOffice {
  providerOfficeId: string;
  name: string;
  address: LogisticsLocation;
  distanceKm?: number | null;
  phone?: string | null;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  metadata?: Record<string, unknown>;
}

export interface FindLogisticsOfficesRequest {
  origin: LogisticsLocation;
  destination: LogisticsLocation;
  radiusKm?: number | null;
}

export interface FindLogisticsOfficesResponse {
  offices: LogisticsOffice[];
  rawPayload?: unknown;
}

export interface BookLogisticsShipmentRequest {
  origin: LogisticsLocation;
  destination: LogisticsLocation;
  packages: LogisticsPackage[];
  selectedOffice: LogisticsOffice;
}

export interface BookLogisticsShipmentResponse {
  trackingReference?: string | null;
  rawPayload?: unknown;
}

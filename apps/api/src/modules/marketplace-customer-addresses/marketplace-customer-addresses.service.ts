import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';

interface CustomerAddressRow {
  id: string;
  customer_id: string;
  label: string | null;
  recipient_name: string;
  recipient_phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state_province: string | null;
  postal_code: string | null;
  country_code: string;
  latitude: number | string | null;
  longitude: number | string | null;
  is_default: boolean;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

type AddressFields = {
  label: string | null;
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
};

@Injectable()
export class MarketplaceCustomerAddressesService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string) {
    const result = await this.database.query<CustomerAddressRow>(
      `SELECT
         id, customer_id, label, recipient_name, recipient_phone,
         address_line1, address_line2, city, state_province,
         postal_code, country_code, latitude, longitude,
         is_default, enabled, created_at, updated_at
       FROM marketplace_customer_addresses
       WHERE customer_id = $1 AND enabled = true
       ORDER BY is_default DESC, created_at DESC, id`,
      [userId],
    );

    return result.rows.map((row) => this.toAddressResponse(row));
  }

  async create(userId: string, dto: CreateCustomerAddressDto) {
    this.validateCountryCode(dto.countryCode);
    this.validateCoordinates(dto.latitude, dto.longitude);

    return this.database.withTransaction(async (client) => {
      await this.lockCustomer(client, userId);

      const makeDefault = dto.isDefault ?? false;

      if (makeDefault) {
        await this.clearDefault(client, userId);
      }

      const result = await client.query<CustomerAddressRow>(
        `INSERT INTO marketplace_customer_addresses (
           customer_id, label, recipient_name, recipient_phone,
           address_line1, address_line2, city, state_province,
           postal_code, country_code, latitude, longitude, is_default
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         )
         RETURNING
           id, customer_id, label, recipient_name, recipient_phone,
           address_line1, address_line2, city, state_province,
           postal_code, country_code, latitude, longitude,
           is_default, enabled, created_at, updated_at`,
        [
          userId,
          dto.label ?? null,
          dto.recipientName,
          dto.recipientPhone,
          dto.addressLine1,
          dto.addressLine2 ?? null,
          dto.city,
          dto.stateProvince ?? null,
          dto.postalCode ?? null,
          dto.countryCode.toUpperCase(),
          dto.latitude ?? null,
          dto.longitude ?? null,
          makeDefault,
        ],
      );

      return this.toAddressResponse(result.rows[0]!);
    });
  }

  async update(
    userId: string,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    return this.database.withTransaction(async (client) => {
      await this.lockCustomer(client, userId);

      const existing = await this.getOwnedAddress(
        client,
        userId,
        addressId,
      );

      const merged = this.mergeAddress(existing, dto);

      this.validateCountryCode(merged.countryCode);
      this.validateCoordinates(merged.latitude, merged.longitude);

      if (dto.isDefault === true) {
        await this.clearDefault(client, userId);
      }

      const result = await client.query<CustomerAddressRow>(
        `UPDATE marketplace_customer_addresses
         SET label = $1,
             recipient_name = $2,
             recipient_phone = $3,
             address_line1 = $4,
             address_line2 = $5,
             city = $6,
             state_province = $7,
             postal_code = $8,
             country_code = $9,
             latitude = $10,
             longitude = $11,
             is_default = $12,
             updated_at = now()
         WHERE id = $13
           AND customer_id = $14
           AND enabled = true
         RETURNING
           id, customer_id, label, recipient_name, recipient_phone,
           address_line1, address_line2, city, state_province,
           postal_code, country_code, latitude, longitude,
           is_default, enabled, created_at, updated_at`,
        [
          merged.label,
          merged.recipientName,
          merged.recipientPhone,
          merged.addressLine1,
          merged.addressLine2,
          merged.city,
          merged.stateProvince,
          merged.postalCode,
          merged.countryCode,
          merged.latitude,
          merged.longitude,
          dto.isDefault ?? existing.is_default,
          addressId,
          userId,
        ],
      );

      return this.toAddressResponse(result.rows[0]!);
    });
  }

  async disable(userId: string, addressId: string) {
    return this.database.withTransaction(async (client) => {
      await this.lockCustomer(client, userId);

      const result = await client.query<CustomerAddressRow>(
        `UPDATE marketplace_customer_addresses
         SET enabled = false,
             is_default = false,
             updated_at = now()
         WHERE id = $1
           AND customer_id = $2
           AND enabled = true
         RETURNING
           id, customer_id, label, recipient_name, recipient_phone,
           address_line1, address_line2, city, state_province,
           postal_code, country_code, latitude, longitude,
           is_default, enabled, created_at, updated_at`,
        [addressId, userId],
      );

      if (!result.rows[0]) {
        throw new NotFoundException('Customer address not found');
      }

      return {
        disabled: true,
        address: this.toAddressResponse(result.rows[0]),
      };
    });
  }

  private async lockCustomer(
    client: PoolClient,
    userId: string,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Customer not found');
    }
  }

  private async clearDefault(
    client: PoolClient,
    userId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE marketplace_customer_addresses
       SET is_default = false, updated_at = now()
       WHERE customer_id = $1
         AND enabled = true
         AND is_default = true`,
      [userId],
    );
  }

  private async getOwnedAddress(
    client: PoolClient,
    userId: string,
    addressId: string,
  ): Promise<CustomerAddressRow> {
    const result = await client.query<CustomerAddressRow>(
      `SELECT
         id, customer_id, label, recipient_name, recipient_phone,
         address_line1, address_line2, city, state_province,
         postal_code, country_code, latitude, longitude,
         is_default, enabled, created_at, updated_at
       FROM marketplace_customer_addresses
       WHERE id = $1
         AND customer_id = $2
         AND enabled = true
       FOR UPDATE`,
      [addressId, userId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Customer address not found');
    }

    return result.rows[0];
  }

  private mergeAddress(
    row: CustomerAddressRow,
    dto: UpdateCustomerAddressDto,
  ): AddressFields {
    return {
      label: dto.label === undefined ? row.label : dto.label,
      recipientName: dto.recipientName ?? row.recipient_name,
      recipientPhone: dto.recipientPhone ?? row.recipient_phone,
      addressLine1: dto.addressLine1 ?? row.address_line1,
      addressLine2:
        dto.addressLine2 === undefined
          ? row.address_line2
          : dto.addressLine2,
      city: dto.city ?? row.city,
      stateProvince:
        dto.stateProvince === undefined
          ? row.state_province
          : dto.stateProvince,
      postalCode:
        dto.postalCode === undefined
          ? row.postal_code
          : dto.postalCode,
      countryCode: dto.countryCode ?? row.country_code,
      latitude:
        dto.latitude === undefined
          ? this.toNullableNumber(row.latitude)
          : dto.latitude,
      longitude:
        dto.longitude === undefined
          ? this.toNullableNumber(row.longitude)
          : dto.longitude,
    };
  }

  private validateCountryCode(value: string): void {
    if (!/^[A-Za-z]{2}$/.test(value)) {
      throw new BadRequestException(
        'Country code must contain exactly two letters',
      );
    }
  }

  private validateCoordinates(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ): void {
    const hasLatitude = latitude !== null && latitude !== undefined;
    const hasLongitude = longitude !== null && longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'Latitude and longitude must be provided together',
      );
    }
  }

  private toNullableNumber(
    value: number | string | null,
  ): number | null {
    if (value === null) {
      return null;
    }

    return Number(value);
  }

  private toAddressResponse(row: CustomerAddressRow) {
    return {
      id: row.id,
      label: row.label,
      recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      stateProvince: row.state_province,
      postalCode: row.postal_code,
      countryCode: row.country_code,
      latitude: this.toNullableNumber(row.latitude),
      longitude: this.toNullableNumber(row.longitude),
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

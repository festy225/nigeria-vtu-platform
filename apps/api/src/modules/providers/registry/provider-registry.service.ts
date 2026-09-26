import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CreateProviderDto } from '../dto/create-provider.dto';
import type { CreateProviderConfigurationDto } from '../dto/create-provider-configuration.dto';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { AuditService } from '../../audit/audit.service';
import {
  ProviderConfigurationRecord,
  ProviderRecord,
  ProviderRegistrationRecord,
  ProviderStatus,
} from './provider-registry.types';

interface ProviderRow {
  id: string;
  name: string;
  adapter_key: string | null;
  status: ProviderStatus;
  base_url: string | null;
  capabilities: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ProviderConfigurationRow {
  id: string;
  provider_id: string;
  service_id: string | null;
  priority: number;
  is_primary: boolean;
  is_backup: boolean;
  enabled: boolean;
  secret_ref: string;
  config: Record<string, unknown>;
  updated_at: Date;
}

@Injectable()
export class ProviderRegistryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async findAllProviders(): Promise<ProviderRecord[]> {
    const result = await this.database.query<ProviderRow>(
      `
        SELECT
          id,
          adapter_key,
          name,
          status,
          base_url,
          capabilities,
          created_at,
          updated_at
        FROM api_providers
        ORDER BY created_at ASC
      `,
    );

    return result.rows.map((row) => this.mapProvider(row));
  }

  async findProviderById(id: string): Promise<ProviderRecord | null> {
    const result = await this.database.query<ProviderRow>(
      `
        SELECT
          id,
          adapter_key,
          name,
          status,
          base_url,
          capabilities,
          created_at,
          updated_at
        FROM api_providers
        WHERE id = $1
      `,
      [id],
    );

    const row = result.rows[0];

    return row ? this.mapProvider(row) : null;
  }

  async createProvider(dto: CreateProviderDto) {
    try {
      const result = await this.database.query<ProviderRow>(
        `
          INSERT INTO api_providers (
            name,
            adapter_key,
            base_url,
            capabilities
          )
          VALUES ($1, $2, $3, $4::jsonb)
          RETURNING
            id,
            adapter_key,
            name,
            status,
            base_url,
            capabilities,
            created_at,
            updated_at
        `,
        [
          dto.name.trim(),
          dto.adapterKey.trim(),
          dto.baseUrl ?? null,
          JSON.stringify(dto.capabilities ?? {}),
        ],
      );

      return this.mapProvider(result.rows[0]);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Provider name already exists');
      }

      throw error;
    }
  }

  async createProviderConfiguration(
    dto: CreateProviderConfigurationDto,
    updatedBy?: string,
  ): Promise<ProviderConfigurationRecord> {
    if (dto.isPrimary && dto.isBackup) {
      throw new BadRequestException(
        'A provider configuration cannot be both primary and backup',
      );
    }

    if (dto.isPrimary && !dto.enabled) {
      throw new BadRequestException(
        'A primary provider configuration must be enabled',
      );
    }

    try {
      const configuration = await this.database.withTransaction(
        async (client: PoolClient) => {
          const providerResult = await client.query(
            `
              SELECT id
              FROM api_providers
              WHERE id = $1
              FOR SHARE
            `,
            [dto.providerId],
          );

          if (providerResult.rowCount === 0) {
            throw new NotFoundException('Provider not found');
          }

          if (dto.serviceId) {
            const serviceResult = await client.query(
              `
                SELECT id
                FROM services
                WHERE id = $1
                FOR SHARE
              `,
              [dto.serviceId],
            );

            if (serviceResult.rowCount === 0) {
              throw new NotFoundException('Service not found');
            }
          }

          if (dto.isPrimary) {
            await client.query(
              `
                SELECT id
                FROM provider_configurations
                WHERE service_id IS NOT DISTINCT FROM $1
                  AND enabled = true
                  AND is_primary = true
                FOR UPDATE
              `,
              [dto.serviceId ?? null],
            );

            await client.query(
              `
                UPDATE provider_configurations
                SET is_primary = false,
                    updated_at = now()
                WHERE service_id IS NOT DISTINCT FROM $1
                  AND enabled = true
                  AND is_primary = true
              `,
              [dto.serviceId ?? null],
            );
          }

          const result = await client.query<ProviderConfigurationRow>(
            `
              INSERT INTO provider_configurations (
                provider_id,
                service_id,
                config,
                secret_ref,
                priority,
                is_primary,
                is_backup,
                enabled,
                updated_by,
                updated_at
              )
              VALUES (
                $1,
                $2,
                $3::jsonb,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                now()
              )
              RETURNING
                id,
                provider_id,
                service_id,
                priority,
                is_primary,
                is_backup,
                enabled,
                secret_ref,
                config,
                updated_at
            `,
            [
              dto.providerId,
              dto.serviceId ?? null,
              JSON.stringify(dto.config ?? {}),
              dto.secretRef,
              dto.priority,
              dto.isPrimary,
              dto.isBackup,
              dto.enabled,
              updatedBy ?? null,
            ],
          );

          return result.rows[0];
        },
      );

      const mapped = this.mapConfiguration(configuration);

      if (updatedBy) {
  await this.audit.record({
    actorId: updatedBy,
    action: 'PROVIDER_CONFIGURATION_CREATED',
    resourceType: 'PROVIDER_CONFIGURATION',
    resourceId: mapped.id,
    afterData: {
      providerId: mapped.providerId,
      serviceId: mapped.serviceId,
      priority: mapped.priority,
      isPrimary: mapped.isPrimary,
      isBackup: mapped.isBackup,
      enabled: mapped.enabled,
    },
  });
}
      return mapped;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'A provider configuration already exists for this provider and service',
        );
      }

      throw error;
    }
  }

  async findConfigurations(
    providerId?: string,
    serviceId?: string,
  ): Promise<ProviderConfigurationRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (providerId) {
      values.push(providerId);
      conditions.push(`provider_id = $${values.length}`);
    }

    if (serviceId) {
      values.push(serviceId);
      conditions.push(`service_id = $${values.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.database.query<ProviderConfigurationRow>(
      `
        SELECT
          id,
          provider_id,
          service_id,
          priority,
          is_primary,
          is_backup,
          enabled,
          secret_ref,
          config,
          updated_at
        FROM provider_configurations
        ${whereClause}
        ORDER BY priority ASC, updated_at ASC
      `,
      values,
    );

    return result.rows.map((row) => this.mapConfiguration(row));
  }

    async findRegistrations(
    serviceId?: string,
  ): Promise<ProviderRegistrationRecord[]> {
    const configurations = await this.findConfigurations(
      undefined,
      serviceId,
    );

    if (configurations.length === 0) {
      return [];
    }

    const providerIds = [
      ...new Set(
        configurations.map((configuration) => configuration.providerId),
      ),
    ];

    const placeholders = providerIds
      .map((_, index) => `$${index + 1}`)
      .join(', ');

    const result = await this.database.query<ProviderRow>(
      `
        SELECT
          id,
          adapter_key,
          name,
          base_url,
          capabilities,
          status,
          updated_at
        FROM api_providers
        WHERE id IN (${placeholders})
      `,
      providerIds,
    );

    const providers = new Map(
      result.rows.map((row) => [row.id, this.mapProvider(row)]),
    );

    return configurations
      .map((configuration) => {
        const provider = providers.get(configuration.providerId);

        if (!provider) {
          return null;
        }

        return {
          provider,
          configuration,
        };
      })
      .filter(
        (registration): registration is ProviderRegistrationRecord =>
          registration !== null,
      );
  }

 private mapProvider(row: ProviderRow): ProviderRecord {
  return {
    id: row.id,
    adapterKey: row.adapter_key,
    name: row.name,
    baseUrl: row.base_url,
    capabilities: row.capabilities,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

  async findProviderHealth(providerId: string) {
    const result = await this.database.query(
      `
        SELECT
          id,
          provider_id,
          service_id,
          status,
          success_rate,
          timeout_rate,
          average_latency_ms,
          checked_at
        FROM provider_health
        WHERE provider_id = $1
        ORDER BY checked_at DESC
        LIMIT 20
      `,
      [providerId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      serviceId: row.service_id,
      status: row.status,
      successRate: row.success_rate,
      timeoutRate: row.timeout_rate,
      averageLatencyMs: row.average_latency_ms,
      checkedAt: row.checked_at,
    }));
  }

  private mapConfiguration(
    row: ProviderConfigurationRow,
  ): ProviderConfigurationRecord {
    return {
      id: row.id,
      providerId: row.provider_id,
      serviceId: row.service_id,
      priority: row.priority,
      isPrimary: row.is_primary,
      isBackup: row.is_backup,
      enabled: row.enabled,
      secretRef: row.secret_ref,
      config: row.config ?? {},
      updatedAt: row.updated_at,
    };
  }
}
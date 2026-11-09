import {
  NotFoundException,
  BadRequestException,
  Put,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { ProviderRegistryService } from '../registry/provider-registry.service';
import { AuditService } from '../../audit/audit.service';
import { ProviderSecretResolver } from '../security/provider-secret-resolver.service';
import { CreateProviderDto } from '../dto/create-provider.dto';
import { CreateProviderConfigurationDto } from '../dto/create-provider-configuration.dto';
import { UpdateProviderConfigurationDto } from '../dto/update-provider-configuration.dto';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../auth/auth.types';

/**
 * Redact credential-like keys from provider configuration API responses.
 * This does not modify the stored configuration or adapter configuration.
 */
export function redactProviderConfiguration(value: unknown): unknown {
  const sensitiveKey =
    /(secret|password|token|credential|authorization|api[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?key|signature)/i;

  if (Array.isArray(value)) {
    return value.map((item) => redactProviderConfiguration(item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] =
        sensitiveKey.test(key) && !/(?:endpoint|url|uri|secretref)$/i.test(key)
          ? '[REDACTED]'
          : redactProviderConfiguration(item);
    }

    return result;
  }

  if (typeof value === 'string') {
    // Prevent URLs containing username/password credentials from leaking.
    let sanitized = value.replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi,
      '$1[REDACTED]@',
    );

    // Redact sensitive query parameter values without changing ordinary
    // parameters or the rest of the URL.
    sanitized = sanitized.replace(
      /([?&][^=?&#\s]*(?:secret|password|token|credential|authorization|api[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?key|signature)[^=?&#\s]*=)[^&#\s]*/gi,
      '$1[REDACTED]',
    );

    return sanitized;
  }

  return value;
}

@Controller('admin/providers')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class ProviderManagementController {
  constructor(
    private readonly providerRegistry: ProviderRegistryService,
    private readonly providerSecretResolver: ProviderSecretResolver,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  async create(@Body() dto: CreateProviderDto) {
    const provider = await this.providerRegistry.createProvider(dto);

    return {
      success: true,
      data: {
        ...provider,
        baseUrl: redactProviderConfiguration(provider.baseUrl) as string | null,
      },
    };
  }

  @Post('configurations')
  @Roles('SUPER_ADMIN')
  async createConfiguration(
    @Body() dto: CreateProviderConfigurationDto,
    @Req() request: Request & { user?: AuthenticatedUser },
  ) {
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const configuration =
      await this.providerRegistry.createProviderConfiguration(
        dto,
        user.id,
      );

    return {
      success: true,
      data: {
        id: configuration.id,
        providerId: configuration.providerId,
        serviceId: configuration.serviceId,
        priority: configuration.priority,
        isPrimary: configuration.isPrimary,
        isBackup: configuration.isBackup,
        enabled: configuration.enabled,
        config: redactProviderConfiguration(configuration.config),
        updatedAt: configuration.updatedAt,
      },
    };
  }

  @Get()
  async findAll() {
    const providers = await this.providerRegistry.findAllProviders();

    return {
      success: true,
      data: providers.map((provider) => ({
        id: provider.id,
        adapterKey: provider.adapterKey,
        name: provider.name,
        status: provider.status,
        baseUrl: redactProviderConfiguration(provider.baseUrl) as string | null,
        capabilities: provider.capabilities,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt,
      })),
    };
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const provider = await this.providerRegistry.findProviderById(id);

    return {
      success: true,
      data: provider
        ? {
            id: provider.id,
            name: provider.name,
            status: provider.status,
            baseUrl: redactProviderConfiguration(provider.baseUrl) as string | null,
            capabilities: provider.capabilities,
            createdAt: provider.createdAt,
            updatedAt: provider.updatedAt,
          }
        : null,
    };
  }

  @Get(':id/configurations')
  async findConfigurations(
    @Param('id', new ParseUUIDPipe()) providerId: string,
  ) {
    const configurations =
      await this.providerRegistry.findConfigurations(providerId);

    return {
      success: true,
      data: configurations.map((configuration) => ({
        id: configuration.id,
        providerId: configuration.providerId,
        serviceId: configuration.serviceId,
        priority: configuration.priority,
        isPrimary: configuration.isPrimary,
        isBackup: configuration.isBackup,
        enabled: configuration.enabled,
        config: redactProviderConfiguration(configuration.config),
        updatedAt: configuration.updatedAt,
      })),
    };
  }

  @Patch('configurations/:id')
  @Roles('SUPER_ADMIN')
  async updateConfiguration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProviderConfigurationDto,
    @Req() request: Request & { user?: AuthenticatedUser },
  ) {
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required');

    const configuration = await this.providerRegistry.updateProviderConfiguration(id, dto, user.id);
    return {
      success: true,
      data: {
        id: configuration.id,
        providerId: configuration.providerId,
        serviceId: configuration.serviceId,
        priority: configuration.priority,
        isPrimary: configuration.isPrimary,
        isBackup: configuration.isBackup,
        enabled: configuration.enabled,
        config: redactProviderConfiguration(configuration.config),
        updatedAt: configuration.updatedAt,
      },
    };
  }
  @Get(':id/health')
  async findHealth(
    @Param('id', new ParseUUIDPipe()) providerId: string,
  ) {
    const health =
      await this.providerRegistry.findProviderHealth(providerId);

    return {
      success: true,
      data: health,
    };
  }

  @Get(':providerId/secrets/status')
  @Roles('SUPER_ADMIN')
  async getCredentialStatus(
    @Param('providerId', new ParseUUIDPipe()) providerId: string,
  ) {
    const provider = await this.providerRegistry.findProviderById(providerId);

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    if (provider.adapterKey !== 'FLUTTERWAVE') {
      throw new BadRequestException('Credential vault endpoint is only available for Flutterwave');
    }

    const status = await this.providerSecretResolver.getSecretStatus(providerId);

    return {
      success: true,
      data: {
        hasApiSecret: status.apiSecretConfigured,
        hasWebhookSecret: status.webhookSecretConfigured,
      },
    };
  }

  @Put(':providerId/secrets')
  @Roles('SUPER_ADMIN')
  async updateCredentials(
    @Param('providerId', new ParseUUIDPipe()) providerId: string,
    @Body() body: { apiSecret?: unknown; webhookSecret?: unknown },
    @Req() request: Request & { user?: AuthenticatedUser },
  ) {
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required');

    const provider = await this.providerRegistry.findProviderById(providerId);

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    if (provider.adapterKey !== 'FLUTTERWAVE') {
      throw new BadRequestException('Credential vault endpoint is only available for Flutterwave');
    }

    const apiSecret = body?.apiSecret;
    const webhookSecret = body?.webhookSecret;

    if (
      (apiSecret !== undefined && typeof apiSecret !== 'string') ||
      (webhookSecret !== undefined && typeof webhookSecret !== 'string')
    ) {
      throw new BadRequestException('Credential values must be text');
    }

    const apiValue = typeof apiSecret === 'string' ? apiSecret.trim() : '';
    const webhookValue =
      typeof webhookSecret === 'string' ? webhookSecret.trim() : '';

    if (!apiValue && !webhookValue) {
      throw new BadRequestException('Enter at least one credential to update');
    }

    const before = await this.providerSecretResolver.getSecretStatus(providerId);
    const updatedFields: string[] = [];

    if (apiValue) {
      await this.providerSecretResolver.saveSecret(
        providerId,
        'api_secret',
        apiValue,
        user.id,
      );
      updatedFields.push('api_secret');
    }

    if (webhookValue) {
      await this.providerSecretResolver.saveSecret(
        providerId,
        'webhook_secret',
        webhookValue,
        user.id,
      );
      updatedFields.push('webhook_secret');
    }

    const after = await this.providerSecretResolver.getSecretStatus(providerId);
    const userAgent = request.headers['user-agent'];

    await this.auditService.record({
      actorId: user.id,
      action: 'PROVIDER_CREDENTIALS_UPDATED',
      resourceType: 'API_PROVIDER',
      resourceId: providerId,
      beforeData: before,
      afterData: {
        ...after,
        updatedFields,
      },
      ipAddress: request.ip,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    });

    return {
      success: true,
      message: 'Flutterwave credentials saved securely',
      data: {
        hasApiSecret: after.apiSecretConfigured,
        hasWebhookSecret: after.webhookSecretConfigured,
      },
    };
  }}

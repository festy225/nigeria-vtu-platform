import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { DatabaseService } from '../../../infrastructure/database/database.service';

const SECRET_NAMES = ['api_secret', 'webhook_secret'] as const;
type ProviderSecretName = (typeof SECRET_NAMES)[number];

@Injectable()
export class ProviderSecretResolver {
  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {}

  resolve(secretRef: string): string {
    const match =
      typeof secretRef === 'string'
        ? /^env:([A-Z][A-Z0-9_]*)$/.exec(secretRef)
        : null;

    if (!match) {
      throw new ServiceUnavailableException(
        'Provider credentials are not configured',
      );
    }

    const value = this.config.get<string>(match[1]);
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ServiceUnavailableException(
        'Provider credentials are not configured',
      );
    }

    return value;
  }

  async resolveAsync(secretRef: string): Promise<string> {
    if (typeof secretRef !== 'string') {
      throw new ServiceUnavailableException(
        'Provider credentials are not configured',
      );
    }

    if (secretRef.startsWith('env:')) {
      return this.resolve(secretRef);
    }

    const match =
      /^vault:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(api_secret|webhook_secret)$/i.exec(
        secretRef,
      );

    if (!match) {
      throw new ServiceUnavailableException(
        'Provider credentials are not configured',
      );
    }

    const providerId = match[1];
    const secretName = match[2] as ProviderSecretName;

    const encrypted = await this.database.withTransaction(async (client) => {
      const result = await client.query<{ encrypted_value: string }>(
        `SELECT encrypted_value
         FROM provider_secrets
         WHERE provider_id = $1 AND secret_name = $2
         LIMIT 1`,
        [providerId, secretName],
      );
      return result.rows[0]?.encrypted_value ?? null;
    });

    if (!encrypted) {
      throw new ServiceUnavailableException(
        'Provider credentials are not configured',
      );
    }

    return this.decrypt(encrypted);
  }

  async saveSecret(
    providerId: string,
    secretName: ProviderSecretName,
    value: string,
    updatedBy?: string,
  ): Promise<void> {
    if (!this.isUuid(providerId) || !SECRET_NAMES.includes(secretName)) {
      throw new BadRequestException('Invalid provider credential details');
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('Credential value cannot be empty');
    }

    const encrypted = this.encrypt(value.trim());

    await this.database.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO provider_secrets
           (provider_id, secret_name, encrypted_value, encryption_version, updated_by)
         VALUES ($1, $2, $3, 1, $4)
         ON CONFLICT (provider_id, secret_name)
         DO UPDATE SET
           encrypted_value = EXCLUDED.encrypted_value,
           encryption_version = 1,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [providerId, secretName, encrypted, updatedBy ?? null],
      );
    });
  }

  async getSecretStatus(
    providerId: string,
  ): Promise<{ apiSecretConfigured: boolean; webhookSecretConfigured: boolean }> {
    if (!this.isUuid(providerId)) {
      throw new BadRequestException('Invalid provider ID');
    }

    const names = await this.database.withTransaction(async (client) => {
      const result = await client.query<{ secret_name: string }>(
        `SELECT secret_name
         FROM provider_secrets
         WHERE provider_id = $1
           AND secret_name = ANY($2::varchar[])`,
        [providerId, [...SECRET_NAMES]],
      );
      return result.rows.map((row) => row.secret_name);
    });

    return {
      apiSecretConfigured: names.includes('api_secret'),
      webhookSecretConfigured: names.includes('webhook_secret'),
    };
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  private decrypt(value: string): string {
    try {
      const parts = value.split(':');
      if (parts.length !== 4 || parts[0] !== 'v1') {
        throw new Error('Unsupported encrypted secret format');
      }

      const iv = Buffer.from(parts[1], 'base64');
      const authTag = Buffer.from(parts[2], 'base64');
      const ciphertext = Buffer.from(parts[3], 'base64');

      if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
        throw new Error('Invalid encrypted secret');
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        iv,
      );
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException(
        'Provider credentials could not be decrypted',
      );
    }
  }

  private encryptionKey(): Buffer {
    const configured = this.config.get<string>(
      'PROVIDER_SECRETS_ENCRYPTION_KEY',
    );

    if (typeof configured !== 'string' || !configured.trim()) {
      throw new ServiceUnavailableException(
        'Provider credential encryption is not configured',
      );
    }

    const value = configured.trim();
    let key: Buffer;

    if (/^[0-9a-fA-F]{64}$/.test(value)) {
      key = Buffer.from(value, 'hex');
    } else {
      key = Buffer.from(value, 'base64');
      if (
        key.length !== 32 ||
        key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')
      ) {
        throw new ServiceUnavailableException(
          'Provider credential encryption is not configured',
        );
      }
    }

    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'Provider credential encryption is not configured',
      );
    }

    return key;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
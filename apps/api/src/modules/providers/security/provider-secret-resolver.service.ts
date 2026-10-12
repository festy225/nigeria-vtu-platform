import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Resolves references to secrets held in the application's environment.
 *
 * Supported reference format: env:VARIABLE_NAME
 * The reference is never itself treated as a secret value.
 *
 * This implementation deliberately does not log references or secret values.
 * A managed secret-store implementation can replace this service later.
 */
@Injectable()
export class ProviderSecretResolver {
  constructor(private readonly config: ConfigService) {}

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
}

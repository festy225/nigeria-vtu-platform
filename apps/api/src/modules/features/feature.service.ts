import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';

export interface FeatureToggle {
  key: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

@Injectable()
export class FeatureService {
  private readonly cache = new Map<string, { enabled: boolean; expiresAt: number }>();
  private readonly cacheTtlMs = 5_000;

  constructor(private readonly database: DatabaseService) {}

  async isEnabled(key: string): Promise<boolean> {
    const normalized = key.trim().toUpperCase();
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.enabled;

    const result = await this.database.query<{ enabled: boolean }>(
      `SELECT enabled FROM feature_toggles WHERE key = $1`,
      [normalized]
    );
    const enabled = result.rows[0]?.enabled ?? false;
    this.cache.set(normalized, { enabled, expiresAt: Date.now() + this.cacheTtlMs });
    return enabled;
  }

  async list(): Promise<FeatureToggle[]> {
    const result = await this.database.query<FeatureToggle>(
      `SELECT key, enabled, metadata, updated_at AS "updatedAt"
       FROM feature_toggles ORDER BY key`
    );
    return result.rows;
  }

  async setEnabled(key: string, enabled: boolean, updatedBy?: string) {
    const normalized = key.trim().toUpperCase();
    const result = await this.database.query<FeatureToggle>(
      `UPDATE feature_toggles
       SET enabled = $1, updated_by = $2, updated_at = now()
       WHERE key = $3
       RETURNING key, enabled, metadata, updated_at AS "updatedAt"`,
      [enabled, updatedBy ?? null, normalized]
    );
    if (!result.rows[0]) return null;
    this.cache.delete(normalized);
    return result.rows[0];
  }

  clearCache() {
    this.cache.clear();
  }
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';

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

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

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
    const result = await this.database.query<FeatureToggle & { previousEnabled: boolean }>(
      `WITH current_toggle AS (
         SELECT key, enabled AS "previousEnabled"
         FROM feature_toggles
         WHERE key = $3
         FOR UPDATE
       ), updated_toggle AS (
         UPDATE feature_toggles
         SET enabled = $1, updated_by = $2, updated_at = now()
         FROM current_toggle
         WHERE feature_toggles.key = current_toggle.key
         RETURNING feature_toggles.key, feature_toggles.enabled, feature_toggles.metadata,
                   feature_toggles.updated_at AS "updatedAt", current_toggle."previousEnabled"
       )
       SELECT * FROM updated_toggle`,
      [enabled, updatedBy ?? null, normalized]
    );
    if (!result.rows[0]) return null;
    this.cache.delete(normalized);
    const { previousEnabled, ...updated } = result.rows[0];
    if (previousEnabled !== updated.enabled && updatedBy) {
      await this.audit.record({
        actorId: updatedBy,
        action: 'FEATURE_TOGGLE_UPDATED',
        resourceType: 'FEATURE_TOGGLE',
        beforeData: { key: normalized, enabled: previousEnabled },
        afterData: { key: normalized, enabled: updated.enabled }
      });
    }
    return updated;
  }

  clearCache() {
    this.cache.clear();
  }
}

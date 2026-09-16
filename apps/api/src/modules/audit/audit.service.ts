import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';

export interface AuditEvent {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeData?: unknown;
  afterData?: unknown;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.database.query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, before_data, after_data, reason, ip_address, user_agent, correlation_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::inet,$9,$10)`,
      [event.actorId ?? null, event.action, event.resourceType, event.resourceId ?? null, JSON.stringify(event.beforeData ?? null), JSON.stringify(event.afterData ?? null), event.reason ?? null, event.ipAddress ?? null, event.userAgent ?? null, event.correlationId ?? null]
    );
  }
}

import type { UserRole } from '@nigeria-vtu-platform/shared';

export interface AuthenticatedUser { id: string; email: string | null; phone: string | null; roles: UserRole[]; sessionId?: string; }
export interface AuthSession { id: string; user_id: string; refresh_token_hash: string; expires_at: string | Date; revoked_at: string | Date | null; }

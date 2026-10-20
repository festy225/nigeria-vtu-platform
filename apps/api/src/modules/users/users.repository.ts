import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findById(id: string) {
    const result = await this.database.query(
      'SELECT id, email, phone, status, created_at, updated_at FROM users WHERE id = $1',
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const result = await this.database.query(
      'SELECT id, email, phone, status, created_at, updated_at FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0] ?? null;
  }

  async listUsers(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;
    const pattern = search ? `%${search}%` : null;

    const [usersResult, countResult] = await Promise.all([
      this.database.query(
        `SELECT
           u.id,
           u.email,
           u.phone,
           u.status,
           u.created_at,
           u.updated_at,
           COALESCE(
             array_agg(DISTINCT r.code::text)
               FILTER (WHERE r.code IS NOT NULL),
             ARRAY[]::text[]
           ) AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE (
           $3::text IS NULL
           OR u.email::text ILIKE $3
           OR COALESCE(u.phone, '') ILIKE $3
           OR u.id::text ILIKE $3
         )
         GROUP BY u.id
         ORDER BY u.created_at DESC, u.id
         LIMIT $1 OFFSET $2`,
        [limit, offset, pattern],
      ),
      this.database.query(
        `SELECT COUNT(*)::text AS total
         FROM users u
         WHERE (
           $1::text IS NULL
           OR u.email::text ILIKE $1
           OR COALESCE(u.phone, '') ILIKE $1
           OR u.id::text ILIKE $1
         )`,
        [pattern],
      ),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);

    return {
      items: usersResult.rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}

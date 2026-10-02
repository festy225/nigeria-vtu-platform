import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type { UserRole } from '@nigeria-vtu-platform/shared';
import type { Request } from 'express';
import type { AuthenticatedUser, AuthSession } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService, private readonly jwt: JwtService, private readonly config: ConfigService) {}
  async register(
    input: {
      name: string;
      email: string;
      phone: string;
      password: string;
      confirmPassword: string;
    },
    request: Request,
  ) {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();

    if (!name) {
      throw new BadRequestException('Name is required');
    }

    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const result = await this.db.withTransaction(async (client) => {
        const inserted = await client.query<{
          id: string;
          email: string | null;
          phone: string | null;
        }>(
          `INSERT INTO users (email, phone, password_hash, status)
           VALUES ($1, $2, $3, 'ACTIVE')
           RETURNING id, email, phone`,
          [email, phone, passwordHash],
        );

        const user = inserted.rows[0];

        await client.query(
          `INSERT INTO customer_profiles (user_id, display_name)
           VALUES ($1, $2)`,
          [user.id, name],
        );

        const role = await client.query<{ id: string }>(
          `SELECT id FROM roles WHERE code = 'CUSTOMER'`,
        );

        if (!role.rows[0]) {
          throw new Error('Customer role is not seeded');
        }

       await client.query(
  `INSERT INTO user_roles (user_id, role_id)
   VALUES ($1, $2)`,
  [user.id, role.rows[0].id],
);

        const wallets = await client.query<{
          id: string;
          currency: 'NGN' | 'USD';
        }>(
          `INSERT INTO wallets (user_id, currency, wallet_kind, status)
           VALUES
             ($1, 'NGN', 'USER', 'ACTIVE'),
             ($1, 'USD', 'USER', 'ACTIVE')
           RETURNING id, currency`,
          [user.id],
        );

        for (const wallet of wallets.rows) {
          await client.query(
            `INSERT INTO wallet_balances (wallet_id, available_minor, held_minor)
             VALUES ($1, 0, 0)
             ON CONFLICT (wallet_id) DO NOTHING`,
            [wallet.id],
          );
        }

        const verificationTokens: {
          purpose: 'EMAIL_VERIFICATION' | 'PHONE_VERIFICATION';
          token: string;
        }[] = [];

        if (email) {
  const token = randomBytes(32).toString('hex');

  verificationTokens.push({
    purpose: 'EMAIL_VERIFICATION',
    token,
  });

  await client.query(
    `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, 'EMAIL_VERIFICATION', now() + ($3 * interval '1 second'))`,
    [
      user.id,
      this.hashToken(token),
      this.durationMs(
        this.config.get('EMAIL_VERIFICATION_TOKEN_TTL', '30m'),
      ) / 1000,
    ],
  );
}

if (phone) {
  const token = randomBytes(32).toString('hex');

  verificationTokens.push({
    purpose: 'PHONE_VERIFICATION',
    token,
  });

  await client.query(
    `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, 'PHONE_VERIFICATION', now() + ($3 * interval '1 second'))`,
    [
      user.id,
      this.hashToken(token),
      this.durationMs(
        this.config.get('PHONE_VERIFICATION_TOKEN_TTL', '10m'),
      ) / 1000,
    ],
  );
}
        return {
          user,
          verificationTokens,
        };
      });

      const session = await this.issueSession(
        {
          id: result.user.id,
          email: result.user.email,
          phone: result.user.phone,
          roles: ['CUSTOMER'],
        },
        request,
      );

      return {
        ...session,
        verification: result.verificationTokens.map((item) => ({
          purpose: item.purpose,
          token:
            this.config.get('NODE_ENV') === 'production'
              ? undefined
              : item.token,
        })),
      };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'An account already exists with those details',
        );
      }

      throw error;
    }
  }
  async login(identifier: string, password: string, request: Request) {
    const normalized = identifier.trim().toLowerCase();
    const result = await this.db.query<{ id: string; email: string | null; phone: string | null; password_hash: string; status: string; roles: UserRole[] }>(`SELECT u.id,u.email,u.phone,u.password_hash,u.status,COALESCE(array_agg(r.code::text) FILTER (WHERE r.code IS NOT NULL),'{}') roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.email=$1 OR u.phone=$1 GROUP BY u.id`, [normalized]);
    const user = result.rows[0];
    if (!user || user.status !== 'ACTIVE' || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) throw new UnauthorizedException('Invalid credentials');
    return this.issueSession({ id: user.id, email: user.email, phone: user.phone, roles: user.roles }, request);
  }
  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token.trim());

    const result = await this.db.query<{
      id: string;
      user_id: string;
    }>(
      `SELECT id, user_id
       FROM auth_tokens
       WHERE token_hash = $1
         AND purpose = 'EMAIL_VERIFICATION'
         AND consumed_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [tokenHash],
    );

    const verificationToken = result.rows[0];

    if (!verificationToken) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET email_verified_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [verificationToken.user_id],
      );

      await client.query(
        `UPDATE auth_tokens
         SET consumed_at = now()
         WHERE id = $1`,
        [verificationToken.id],
      );
    });

    return {
      verified: true,
      type: 'email',
    };
  }

  async verifyPhone(token: string) {
    const tokenHash = this.hashToken(token.trim());

    const result = await this.db.query<{
      id: string;
      user_id: string;
    }>(
      `SELECT id, user_id
       FROM auth_tokens
       WHERE token_hash = $1
         AND purpose = 'PHONE_VERIFICATION'
         AND consumed_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [tokenHash],
    );

    const verificationToken = result.rows[0];

    if (!verificationToken) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET phone_verified_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [verificationToken.user_id],
      );

      await client.query(
        `UPDATE auth_tokens
         SET consumed_at = now()
         WHERE id = $1`,
        [verificationToken.id],
      );
    });

    return {
      verified: true,
      type: 'phone',
    };
  }

  async resendVerification(identifier?: string) {
    const normalized = identifier?.trim().toLowerCase();

    if (!normalized) {
      throw new BadRequestException('Email or phone is required');
    }

    const result = await this.db.query<{
      id: string;
      email: string | null;
      phone: string | null;
      email_verified_at: Date | null;
      phone_verified_at: Date | null;
    }>(
      `SELECT id, email, phone, email_verified_at, phone_verified_at
       FROM users
       WHERE email = $1 OR phone = $1
       LIMIT 1`,
      [normalized],
    );

    const user = result.rows[0];

    if (!user) {
      return { accepted: true };
    }

    let purpose: 'EMAIL_VERIFICATION' | 'PHONE_VERIFICATION';
    let ttl: string;
    let token: string;

    if (user.email === normalized && !user.email_verified_at) {
      purpose = 'EMAIL_VERIFICATION';
      ttl = this.config.get('EMAIL_VERIFICATION_TOKEN_TTL', '30m');
      token = randomBytes(32).toString('hex');
    } else if (user.phone === normalized && !user.phone_verified_at) {
      purpose = 'PHONE_VERIFICATION';
      ttl = this.config.get('PHONE_VERIFICATION_TOKEN_TTL', '10m');
      token = randomBytes(32).toString('hex');
    } else {
      return { accepted: true };
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE auth_tokens
         SET consumed_at = now()
         WHERE user_id = $1
           AND purpose = $2
           AND consumed_at IS NULL`,
        [user.id, purpose],
      );

      await client.query(
        `INSERT INTO auth_tokens
          (user_id, token_hash, purpose, expires_at)
         VALUES
          ($1, $2, $3, now() + ($4 * interval '1 second'))`,
        [
          user.id,
          this.hashToken(token),
          purpose,
          this.durationMs(ttl) / 1000,
        ],
      );
    });

    return {
      accepted: true,
      verification: {
        purpose,
        token:
          this.config.get('NODE_ENV') === 'production'
            ? undefined
            : token,
      },
    };
  }
  async currentUser(userId: string): Promise<AuthenticatedUser> {
    const result = await this.db.query<{ id: string; email: string | null; phone: string | null; status: string; roles: UserRole[] }>(`SELECT u.id,u.email,u.phone,u.status,COALESCE(array_agg(r.code::text) FILTER (WHERE r.code IS NOT NULL),'{}') roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 GROUP BY u.id`, [userId]);
    const user = result.rows[0];
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
    return { id: user.id, email: user.email, phone: user.phone, roles: user.roles };
  }

  async issueSession(user: AuthenticatedUser, request: Request) {
    const sessionId = randomUUID();
    const accessToken = await this.jwt.signAsync({ sub: user.id, sessionId, roles: user.roles, email: user.email, phone: user.phone }, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_TOKEN_TTL', '15m') });
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.durationMs(this.config.get('JWT_REFRESH_TOKEN_TTL', '7d')));
    await this.db.query(`INSERT INTO auth_sessions (id,user_id,refresh_token_hash,user_agent,ip_address,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`, [sessionId, user.id, this.hashToken(refreshToken), request.headers['user-agent'] ?? null, request.ip || null, expiresAt]);
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, phone: user.phone, roles: user.roles } };
  }

  async refresh(refreshToken: string, request: Request) {
    const result = await this.db.query<AuthSession & { email: string | null; phone: string | null; roles: UserRole[] }>(`SELECT s.id,s.user_id,s.refresh_token_hash,s.expires_at,s.revoked_at,u.email,u.phone,COALESCE(array_agg(r.code::text) FILTER (WHERE r.code IS NOT NULL),'{}') roles FROM auth_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE s.refresh_token_hash=$1 GROUP BY s.id,u.id`, [this.hashToken(refreshToken)]);
    const session = result.rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) throw new UnauthorizedException('Invalid refresh token');
    await this.db.query(`UPDATE auth_sessions SET revoked_at=now(),last_used_at=now() WHERE id=$1`, [session.id]);
    return this.issueSession({ id: session.user_id, email: session.email, phone: session.phone, roles: session.roles }, request);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) await this.db.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND refresh_token_hash=$2`, [userId, this.hashToken(refreshToken)]);
    else await this.db.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
    return { loggedOut: true };
  }

  async requestPasswordReset(identifier: string) {
    const found = await this.db.query<{ id: string }>(`SELECT id FROM users WHERE email=$1 OR phone=$1`, [identifier.trim().toLowerCase()]);
    if (found.rows[0]) {
      const raw = randomBytes(32).toString('hex');
      await this.db.query(`INSERT INTO auth_tokens (user_id,token_hash,purpose,expires_at) VALUES ($1,$2,'PASSWORD_RESET',now()+interval '30 minutes')`, [found.rows[0].id, this.hashToken(raw)]);
      return { accepted: true, token: this.config.get('NODE_ENV') === 'production' ? undefined : raw };
    }
    return { accepted: true };
  }

    async resetPassword(token: string, password: string) {
    const result = await this.db.query<{ id: string; user_id: string }>(
      `SELECT id,user_id
       FROM auth_tokens
       WHERE token_hash=$1
         AND purpose='PASSWORD_RESET'
         AND consumed_at IS NULL
         AND expires_at>now()`,
      [this.hashToken(token)],
    );

    if (!result.rows[0]) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash=$1,password_changed_at=now(),updated_at=now()
         WHERE id=$2`,
        [await bcrypt.hash(password, 12), result.rows[0].user_id],
      );

      await client.query(
        `UPDATE auth_tokens SET consumed_at=now() WHERE id=$1`,
        [result.rows[0].id],
      );

      await client.query(
        `UPDATE auth_sessions
         SET revoked_at=now()
         WHERE user_id=$1 AND revoked_at IS NULL`,
        [result.rows[0].user_id],
      );
    });

    return { reset: true };
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private durationMs(value: string | number) {
    if (typeof value === 'number') return value * 1000;

    const match = /^([0-9]+)([smhd])$/.exec(value);

    if (!match) return 7 * 86400000;

    const units: Record<string, number> = {
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
    };

    return Number(match[1]) * units[match[2]];
  }
}
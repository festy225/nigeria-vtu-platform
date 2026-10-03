import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';

interface MembershipTermsProgramRow {
  id: string;
  terms_version: string;
}

export interface MembershipTermsAcceptance {
  id: string;
  userId: string;
  membershipProgramId: string;
  termsVersion: string;
  acceptedAt: Date;
}

@Injectable()
export class MembershipTermsService {
  constructor(private readonly db: DatabaseService) {}

  async acceptCurrentTerms(
    userId: string,
    membershipProgramId: string,
  ): Promise<MembershipTermsAcceptance> {
    return this.db.withTransaction(async (client) => {
      const programResult = await client.query<MembershipTermsProgramRow>(
        `SELECT id, terms_version
         FROM business_membership_programs
         WHERE id = $1
         FOR SHARE`,
        [membershipProgramId],
      );
      const program = programResult.rows[0];

      if (!program) {
        throw new NotFoundException('Membership program not found');
      }

      return this.recordAcceptance(
        client,
        userId,
        program.id,
        program.terms_version,
      );
    });
  }

  async hasAcceptedCurrentTerms(
    userId: string,
    membershipProgramId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ accepted: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM business_membership_terms_acceptances acceptance
         JOIN business_membership_programs program
           ON program.id = acceptance.membership_program_id
         WHERE acceptance.user_id = $1
           AND acceptance.membership_program_id = $2
           AND acceptance.terms_version = program.terms_version
       ) AS accepted`,
      [userId, membershipProgramId],
    );
    return result.rows[0]?.accepted ?? false;
  }

  private async recordAcceptance(
    client: PoolClient,
    userId: string,
    membershipProgramId: string,
    termsVersion: string,
  ): Promise<MembershipTermsAcceptance> {
    const result = await client.query<{
      id: string;
      user_id: string;
      membership_program_id: string;
      terms_version: string;
      accepted_at: Date;
    }>(
      `INSERT INTO business_membership_terms_acceptances (
         user_id,
         membership_program_id,
         terms_version
       )
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, membership_program_id, terms_version)
       DO UPDATE
         SET accepted_at = business_membership_terms_acceptances.accepted_at
       RETURNING id, user_id, membership_program_id, terms_version, accepted_at`,
      [userId, membershipProgramId, termsVersion],
    );
    const acceptance = result.rows[0];

    return {
      id: acceptance.id,
      userId: acceptance.user_id,
      membershipProgramId: acceptance.membership_program_id,
      termsVersion: acceptance.terms_version,
      acceptedAt: acceptance.accepted_at,
    };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';

const PROGRAM_CODES = ['SELLER', 'WHOLESALER', 'DISTRIBUTOR'] as const;
const CURRENCIES = ['NGN', 'USD'] as const;
const TIERS = ['CUSTOMER', 'SELLER', 'WHOLESALER', 'DISTRIBUTOR'] as const;
type ProgramCode = (typeof PROGRAM_CODES)[number];

export interface MembershipPaymentHistoryRow {
  paymentId: string;
  paymentReference: string;
  userId: string;
  userEmail: string | null;
  programCode: ProgramCode;
  programName: string;
  amountMinor: string;
  currency: string;
  billingPeriod: string;
  state: string;
  providerName: string | null;
  providerReference: string | null;
  createdAt: Date;
}

export interface MembershipPaymentHistoryPage {
  items: MembershipPaymentHistoryRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface MembershipProgramConfigRow {
  id: string;
  programCode: ProgramCode;
  displayName: string;
  description: string | null;
  enabled: boolean;
  monthlyPriceMinor: string | null;
  annualPriceMinor: string | null;
  currency: string;
  validityDuration: number | null;
  validityUnit: string | null;
  termsAndConditions: string | null;
  termsVersion: string;
  updatedAt: Date;
  updatedByUserId: string | null;
  updatedByEmail: string | null;
  updatedByPhone: string | null;
}

export interface MembershipProgramUpdateRow {
  id: string;
  programCode: ProgramCode;
  displayName: string;
  description: string | null;
  enabled: boolean;
  monthlyPriceMinor: string | null;
  annualPriceMinor: string | null;
  currency: string;
  validityDuration: number | null;
  validityUnit: string | null;
  termsAndConditions: string | null;
  termsVersion: string;
  updatedAt: Date;
  updatedByUserId: string | null;
}

export interface FeeRuleRow {
  id: string;
  feeCode: string;
  displayName: string;
  description: string | null;
  feeKind: string;
  amountMinor: string | number | null;
  rateBasisPoints: number | null;
  currency: string;
  countryCode: string | null;
  serviceCode: string | null;
  membershipTier: string | null;
  enabled: boolean;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  createdAt?: Date;
  updatedAt: Date;
}

interface ExistingRow {
  id: string;
  [key: string]: unknown;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(name + ' is required and must be at most ' + max + ' characters');
  }
  return value.trim();
}

function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return text(value, name, max);
}

function price(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new BadRequestException(name + ' must be a non-negative safe integer in minor currency units');
  }
  return result;
}

function dateValue(value: unknown, name: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException(name + ' must be a valid date');
  }
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new BadRequestException(name + ' must be a valid date');
  return result;
}

@Injectable()
export class AdminFeesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listPrograms() {
    const result = await this.db.query<MembershipProgramConfigRow>(
      `SELECT program.id AS id, program.program_code AS "programCode", program.display_name AS "displayName",
        description, enabled, monthly_price_minor AS "monthlyPriceMinor",
        annual_price_minor AS "annualPriceMinor", currency,
        validity_duration AS "validityDuration", validity_unit AS "validityUnit",
        terms_and_conditions AS "termsAndConditions",
        terms_version AS "termsVersion", program.updated_at AS "updatedAt",
        updated_by_user_id AS "updatedByUserId",
        actor.email AS "updatedByEmail", actor.phone AS "updatedByPhone"
       FROM business_membership_programs program
       LEFT JOIN users actor ON actor.id = program.updated_by_user_id
       ORDER BY
       CASE program.program_code WHEN 'SELLER' THEN 1 WHEN 'WHOLESALER' THEN 2 ELSE 3 END`,
    );
    return result.rows;
  }

  async listMembershipPayments(
    programCodeValue?: string,
    stateValue?: string,
    limitValue?: string,
    offsetValue?: string,
  ): Promise<MembershipPaymentHistoryPage> {
    const programCode = programCodeValue?.trim().toUpperCase() || null;
    if (programCode && !PROGRAM_CODES.includes(programCode as ProgramCode)) {
      throw new BadRequestException('Unsupported membership program filter');
    }

    const state = stateValue?.trim().toUpperCase() || null;
    if (state && !['PENDING', 'AUTHORIZED', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'CANCELLED', 'UNKNOWN'].includes(state)) {
      throw new BadRequestException('Unsupported payment state filter');
    }

    const limit = limitValue === undefined ? 50 : Number(limitValue);
    const offset = offsetValue === undefined ? 0 : Number(offsetValue);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new BadRequestException('offset must be a non-negative integer');
    }

    const totalResult = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM payments payment
       JOIN business_membership_programs program
         ON program.id = payment.membership_program_id
       WHERE payment.purpose = 'BUSINESS_MEMBERSHIP'
         AND ($1::text IS NULL OR program.program_code = $1)
         AND ($2::text IS NULL OR payment.state::text = $2)`,
      [programCode, state],
    );
    const result = await this.db.query<MembershipPaymentHistoryRow>(
      `SELECT payment.id AS "paymentId", payment.reference AS "paymentReference",
        payment.user_id AS "userId", customer.email AS "userEmail",
        program.program_code AS "programCode", program.display_name AS "programName",
        payment.amount_minor AS "amountMinor", payment.currency,
        payment.membership_billing_period AS "billingPeriod",
        payment.state::text AS state, payment.provider_name AS "providerName",
        payment.provider_reference AS "providerReference",
        payment.created_at AS "createdAt"
       FROM payments payment
       JOIN business_membership_programs program
         ON program.id = payment.membership_program_id
       JOIN users customer ON customer.id = payment.user_id
       WHERE payment.purpose = 'BUSINESS_MEMBERSHIP'
         AND ($1::text IS NULL OR program.program_code = $1)
         AND ($2::text IS NULL OR payment.state::text = $2)
       ORDER BY payment.created_at DESC, payment.id DESC
       LIMIT $3 OFFSET $4`,
      [programCode, state, limit, offset],
    );
    return {
      items: result.rows,
      total: Number(totalResult.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  async updateProgram(codeValue: string, body: Record<string, unknown>, actorId: string) {
    const code = codeValue.toUpperCase() as ProgramCode;
    if (!PROGRAM_CODES.includes(code)) throw new BadRequestException('Unsupported membership program');

    const monthly = price(body.monthlyPriceMinor, 'monthlyPriceMinor');
    const annual = price(body.annualPriceMinor, 'annualPriceMinor');
    const enabled = body.enabled;
    if (typeof enabled !== 'boolean') throw new BadRequestException('enabled must be a boolean');

    const currency = text(body.currency, 'currency', 3).toUpperCase();
    if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) {
      throw new BadRequestException('Currency must be NGN or USD');
    }

    const termsVersion = text(body.termsVersion, 'termsVersion', 120);
    const termsAndConditions = optionalText(body.termsAndConditions, 'termsAndConditions', 20000);
    const description = optionalText(body.description, 'description', 4000);
    const duration = body.validityDuration === '' || body.validityDuration == null
      ? null : Number(body.validityDuration);
    const unit = optionalText(body.validityUnit, 'validityUnit', 10)?.toUpperCase() ?? null;

    if (duration !== null && (!Number.isSafeInteger(duration) || duration <= 0)) {
      throw new BadRequestException('validityDuration must be a positive integer');
    }
    if ((duration === null) !== (unit === null)) {
      throw new BadRequestException('validityDuration and validityUnit must be set together');
    }
    if (unit !== null && !['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(unit)) {
      throw new BadRequestException('Unsupported validityUnit');
    }
    if (enabled && !((monthly ?? 0) > 0 || (annual ?? 0) > 0)) {
      throw new BadRequestException('An enabled program needs at least one positive membership price');
    }
    if (enabled && !termsAndConditions) {
      throw new BadRequestException('An enabled program needs membership terms and conditions');
    }

    return this.db.withTransaction(async (client: PoolClient) => {
      const beforeResult = await client.query<ExistingRow>(
        'SELECT * FROM business_membership_programs WHERE program_code = $1 FOR UPDATE',
        [code],
      );
      if (!beforeResult.rows[0]) throw new NotFoundException('Membership program not found');
      const before = beforeResult.rows[0];

      const updated = await client.query<MembershipProgramUpdateRow>(
        `UPDATE business_membership_programs SET
          display_name = $2, description = $3, enabled = $4,
          monthly_price_minor = $5, annual_price_minor = $6, currency = $7,
          validity_duration = $8, validity_unit = $9, terms_version = $10,
          terms_and_conditions = $11, updated_by_user_id = $12,
          updated_at = now()
         WHERE program_code = $1
         RETURNING id, program_code AS "programCode", display_name AS "displayName",
          description, enabled, monthly_price_minor AS "monthlyPriceMinor",
          annual_price_minor AS "annualPriceMinor", currency,
          validity_duration AS "validityDuration", validity_unit AS "validityUnit",
          terms_and_conditions AS "termsAndConditions",
          terms_version AS "termsVersion", updated_at AS "updatedAt",
          updated_by_user_id AS "updatedByUserId"`,
        [code, text(body.displayName, 'displayName', 120), description, enabled,
          monthly, annual, currency, duration, unit, termsVersion,
          termsAndConditions, actorId],
      );
      await this.audit.record({
        actorId,
        action: 'MEMBERSHIP_PROGRAM_UPDATED',
        resourceType: 'business_membership_program',
        resourceId: String(before.id),
        beforeData: before,
        afterData: updated.rows[0],
      }, client);
      return updated.rows[0];
    });
  }

  async listRules() {
    const result = await this.db.query<FeeRuleRow>(
      `SELECT id, fee_code AS "feeCode", display_name AS "displayName",
        description, fee_kind AS "feeKind", amount_minor AS "amountMinor",
        rate_basis_points AS "rateBasisPoints", currency, country_code AS "countryCode",
        service_code AS "serviceCode", membership_tier AS "membershipTier",
        enabled, effective_from AS "effectiveFrom", effective_until AS "effectiveUntil",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM platform_fee_rules ORDER BY display_name`,
    );
    return result.rows;
  }

  async createRule(body: Record<string, unknown>, actorId: string) {
    return this.saveRule(null, body, actorId);
  }

  async updateRule(id: string, body: Record<string, unknown>, actorId: string) {
    return this.saveRule(id, body, actorId);
  }

  private async saveRule(id: string | null, body: Record<string, unknown>, actorId: string) {
    const feeCode = text(body.feeCode, 'feeCode', 80).toUpperCase();
    if (!/^[A-Z0-9_]{2,80}$/.test(feeCode)) {
      throw new BadRequestException('feeCode must contain only uppercase letters, digits, and underscores');
    }
    const displayName = text(body.displayName, 'displayName', 160);
    const description = optionalText(body.description, 'description', 4000);
    const feeKind = text(body.feeKind, 'feeKind', 12).toUpperCase();
    if (!['FIXED', 'PERCENTAGE'].includes(feeKind)) {
      throw new BadRequestException('feeKind must be FIXED or PERCENTAGE');
    }

    const amountMinor = feeKind === 'FIXED' ? price(body.amountMinor, 'amountMinor') : null;
    const rateBasisPoints = feeKind === 'PERCENTAGE' ? price(body.rateBasisPoints, 'rateBasisPoints') : null;
    if (feeKind === 'FIXED' && amountMinor === null) {
      throw new BadRequestException('A fixed fee requires amountMinor');
    }
    if (feeKind === 'PERCENTAGE' && (rateBasisPoints === null || rateBasisPoints > 10000)) {
      throw new BadRequestException('A percentage fee must be between 0 and 10000 basis points');
    }

    const currency = text(body.currency, 'currency', 3).toUpperCase();
    if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) {
      throw new BadRequestException('Currency must be NGN or USD');
    }
    const countryCode = optionalText(body.countryCode, 'countryCode', 2)?.toUpperCase() ?? null;
    if (countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException('countryCode must be a two-letter ISO country code');
    }
    const serviceCode = optionalText(body.serviceCode, 'serviceCode', 80);
    const membershipTier = optionalText(body.membershipTier, 'membershipTier', 20)?.toUpperCase() ?? null;
    if (membershipTier !== null && !TIERS.includes(membershipTier as (typeof TIERS)[number])) {
      throw new BadRequestException('Unsupported membershipTier');
    }
    if (typeof body.enabled !== 'boolean') throw new BadRequestException('enabled must be a boolean');

    const effectiveFrom = dateValue(body.effectiveFrom, 'effectiveFrom');
    const effectiveUntil = dateValue(body.effectiveUntil, 'effectiveUntil');
    if (effectiveFrom && effectiveUntil && effectiveUntil <= effectiveFrom) {
      throw new BadRequestException('effectiveUntil must be later than effectiveFrom');
    }

    return this.db.withTransaction(async (client: PoolClient) => {
      let before: Record<string, unknown> | null = null;
      if (id) {
        const found = await client.query<ExistingRow>(
          'SELECT * FROM platform_fee_rules WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!found.rows[0]) throw new NotFoundException('Fee rule not found');
        before = found.rows[0];
      }
      const values = [feeCode, displayName, description, feeKind, amountMinor,
        rateBasisPoints, currency, countryCode, serviceCode, membershipTier,
        body.enabled, effectiveFrom, effectiveUntil];

      const result = id
        ? await client.query<FeeRuleRow>(
          `UPDATE platform_fee_rules SET fee_code=$2, display_name=$3, description=$4,
            fee_kind=$5, amount_minor=$6, rate_basis_points=$7, currency=$8,
            country_code=$9, service_code=$10, membership_tier=$11, enabled=$12,
            effective_from=$13, effective_until=$14, updated_at=now()
           WHERE id=$1
           RETURNING id, fee_code AS "feeCode", display_name AS "displayName",
            description, fee_kind AS "feeKind", amount_minor AS "amountMinor",
            rate_basis_points AS "rateBasisPoints", currency,
            country_code AS "countryCode", service_code AS "serviceCode",
            membership_tier AS "membershipTier", enabled,
            effective_from AS "effectiveFrom", effective_until AS "effectiveUntil",
            updated_at AS "updatedAt"`,
          [id, ...values],
        )
        : await client.query<FeeRuleRow>(
          `INSERT INTO platform_fee_rules
            (fee_code, display_name, description, fee_kind, amount_minor,
             rate_basis_points, currency, country_code, service_code, membership_tier,
             enabled, effective_from, effective_until)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id, fee_code AS "feeCode", display_name AS "displayName",
            description, fee_kind AS "feeKind", amount_minor AS "amountMinor",
            rate_basis_points AS "rateBasisPoints", currency,
            country_code AS "countryCode", service_code AS "serviceCode",
            membership_tier AS "membershipTier", enabled,
            effective_from AS "effectiveFrom", effective_until AS "effectiveUntil",
            updated_at AS "updatedAt"`,
          values,
        );

      await this.audit.record({
        actorId,
        action: id ? 'PLATFORM_FEE_RULE_UPDATED' : 'PLATFORM_FEE_RULE_CREATED',
        resourceType: 'platform_fee_rule',
        resourceId: String(result.rows[0].id),
        beforeData: before,
        afterData: result.rows[0],
      }, client);
      return result.rows[0];
    });
  }
}

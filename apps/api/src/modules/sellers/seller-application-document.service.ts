import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';

type DocumentType =
  | 'IDENTITY_DOCUMENT'
  | 'CAC_CERTIFICATE'
  | 'BUSINESS_PROOF'
  | 'ADDRESS_PROOF';

type StoredDocument = {
  id: string;
  seller_id: string;
  document_type: DocumentType;
  original_filename: string;
  storage_key: string;
  mime_type: string;
  size_bytes: string;
  verification_status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  reviewer_note: string | null;
  reviewed_at: Date | null;
  uploaded_at: Date;
};

@Injectable()
export class SellerApplicationDocumentService {
  private readonly hardFileLimit = 10 * 1024 * 1024;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private storageRoot(): string {
    return resolve(
      this.config.get<string>('SELLER_APPLICATION_DOCUMENT_STORAGE_ROOT')
        || 'storage/private-seller-documents',
    );
  }

  private detectType(buffer: Buffer): { mime: string; extension: string } | null {
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString() === '%PDF-') {
      return { mime: 'application/pdf', extension: '.pdf' };
    }
    if (buffer.length >= 3 && buffer[0] === 0xff &&
        buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mime: 'image/jpeg', extension: '.jpg' };
    }
    if (buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      return { mime: 'image/png', extension: '.png' };
    }
    return null;
  }

  private async assertOwner(
    client: PoolClient,
    userId: string,
  ): Promise<{ id: string; onboarding_status: string; business_registration_status: string | null }> {
    const result = await client.query(
      `SELECT id, onboarding_status, business_registration_status
       FROM marketplace_sellers WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Seller application not found.');
    }
    return result.rows[0];
  }

  private async getStoredDocument(
    applicationId: string,
    documentId: string,
  ): Promise<StoredDocument> {
    const result = await this.database.query<StoredDocument>(
      `SELECT d.*
       FROM seller_application_documents d
       WHERE d.id = $1 AND d.seller_id = $2`,
      [documentId, applicationId],
    );
    if (!result.rows[0]) throw new NotFoundException('Application document not found.');
    return result.rows[0];
  }

  private resolveStoredPath(storageKey: string): string {
    if (!storageKey || isAbsolute(storageKey)) {
      throw new ForbiddenException('Invalid document storage reference.');
    }
    const root = this.storageRoot();
    const path = resolve(root, storageKey);
    const rel = relative(root, path);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new ForbiddenException('Invalid document storage reference.');
    }
    return path;
  }

  async list(userId: string) {
    const seller = await this.database.query(
      'SELECT id FROM marketplace_sellers WHERE user_id = $1',
      [userId],
    );
    if (!seller.rows[0]) throw new NotFoundException('Seller application not found.');
    const result = await this.database.query(
      `SELECT id, seller_id, document_type, original_filename, mime_type,
              size_bytes, verification_status, reviewer_note, reviewed_at, uploaded_at
       FROM seller_application_documents WHERE seller_id = $1 ORDER BY uploaded_at DESC`,
      [seller.rows[0].id],
    );
    return result.rows;
  }

  async upload(userId: string, documentType: DocumentType,
    file: Express.Multer.File | undefined, requestInfo: { ipAddress?: string; userAgent?: string }) {
    const allowed: DocumentType[] = [
      'IDENTITY_DOCUMENT', 'CAC_CERTIFICATE', 'BUSINESS_PROOF', 'ADDRESS_PROOF',
    ];
    if (!allowed.includes(documentType)) throw new BadRequestException('Invalid document type.');
    if (!file?.buffer?.length) throw new BadRequestException('Select a document.');
    if (file.size > this.hardFileLimit) throw new BadRequestException('Maximum document size is 10 MB.');
    const detected = this.detectType(file.buffer);
    if (!detected || detected.mime !== file.mimetype) {
      throw new BadRequestException('Only valid PDF, JPEG, and PNG documents are accepted.');
    }
    const id = randomUUID();
    const key = `${id}${detected.extension}`;
    const root = this.storageRoot();
    await mkdir(root, { recursive: true });
    const path = join(root, key);
    await writeFile(path, file.buffer, { flag: 'wx' });
    try {
      return await this.database.withTransaction(async (client) => {
        const seller = await this.assertOwner(client, userId);
        if (!['DRAFT', 'MORE_INFORMATION_REQUIRED'].includes(seller.onboarding_status)) {
          throw new ConflictException('Documents can only be changed while the application is a draft or requires more information.');
        }
        if (documentType === 'CAC_CERTIFICATE' &&
            seller.business_registration_status !== 'REGISTERED') {
          throw new BadRequestException('CAC certificate is only required for registered businesses.');
        }
        const result = await client.query(
          `INSERT INTO seller_application_documents
           (id, seller_id, document_type, original_filename, storage_key, mime_type, size_bytes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, seller_id, document_type, original_filename, mime_type,
                     size_bytes, verification_status, reviewer_note, reviewed_at, uploaded_at`,
          [id, seller.id, documentType, basename(file.originalname).slice(0, 255),
            key, detected.mime, file.size],
        );
        await this.audit.record({
          actorId: userId,
          action: 'SELLER_APPLICATION_DOCUMENT_UPLOADED',
          resourceType: 'SELLER_APPLICATION_DOCUMENT',
          resourceId: id,
          afterData: { sellerId: seller.id, documentType, mimeType: detected.mime, sizeBytes: file.size },
          ...requestInfo,
        }, client);
        return result.rows[0];
      });
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  async download(applicationId: string, documentId: string) {
    const document = await this.getStoredDocument(applicationId, documentId);
    const path = this.resolveStoredPath(document.storage_key);
    const bytes = await readFile(path).catch(() => {
      throw new NotFoundException('Stored application document not found.');
    });
    return {
      bytes,
      mimeType: document.mime_type,
      filename: document.original_filename,
    };
  }

  async review(
    applicationId: string,
    documentId: string,
    reviewerId: string,
    decision: 'ACCEPTED' | 'REJECTED',
    note?: string,
    requestInfo: { ipAddress?: string; userAgent?: string } = {},
  ) {
    if (!['ACCEPTED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Invalid document review decision.');
    }
    return this.database.withTransaction(async (client) => {
      const current = await client.query(
        `SELECT id, verification_status FROM seller_application_documents
         WHERE id = $1 AND seller_id = $2 FOR UPDATE`,
        [documentId, applicationId],
      );
      if (!current.rows[0]) {
        throw new NotFoundException('Application document not found.');
      }
      const result = await client.query(
        `UPDATE seller_application_documents
         SET verification_status = $1, reviewer_note = $2,
             reviewed_by = $3, reviewed_at = now()
         WHERE id = $4 AND seller_id = $5
         RETURNING id, seller_id, document_type, original_filename,
                   mime_type, size_bytes, verification_status,
                   reviewer_note, reviewed_by, reviewed_at, uploaded_at`,
        [decision, note?.trim() || null, reviewerId, documentId, applicationId],
      );
      await this.audit.record({
        actorId: reviewerId,
        action: 'SELLER_APPLICATION_DOCUMENT_REVIEWED',
        resourceType: 'SELLER_APPLICATION_DOCUMENT',
        resourceId: documentId,
        beforeData: current.rows[0],
        afterData: result.rows[0],
        ...requestInfo,
      }, client);
      return result.rows[0];
    });
  }
}

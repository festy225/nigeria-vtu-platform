import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, resolve, sep } from 'node:path';
import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';

interface StoredMedia {
  id: string;
  product_id: string;
  media_type: 'IMAGE' | 'VIDEO';
  storage_key: string;
  mime_type: string;
  file_size: string | number;
  display_order: number;
  alt_text: string | null;
  created_at: Date | string;
}

interface RequestInfo {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class MarketplaceProductMediaService {
  private readonly hardFileLimit = 50 * 1024 * 1024;

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private storageRoot(): string {
    const configured = this.config.get<string>(
      'MARKETPLACE_MEDIA_STORAGE_ROOT',
      'storage/marketplace-media',
    );
    const root = isAbsolute(configured)
      ? resolve(configured)
      : resolve(process.cwd(), configured);
    return root;
  }

  private maxFiles(): number {
    const value = Number(this.config.get('MARKETPLACE_MEDIA_MAX_FILES', 10));
    return Number.isInteger(value) && value >= 1 && value <= 10 ? value : 10;
  }

  private maxFileSize(): number {
    const value = Number(
      this.config.get('MARKETPLACE_MEDIA_MAX_FILE_SIZE_BYTES', this.hardFileLimit),
    );
    if (!Number.isInteger(value) || value < 1) return this.hardFileLimit;
    return Math.min(value, this.hardFileLimit);
  }

  private detectType(buffer: Buffer): { mime: string; type: 'IMAGE' | 'VIDEO'; extension: string } | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mime: 'image/jpeg', type: 'IMAGE', extension: '.jpg' };
    }
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      return { mime: 'image/png', type: 'IMAGE', extension: '.png' };
    }
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return { mime: 'image/webp', type: 'IMAGE', extension: '.webp' };
    }
    if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
      return { mime: 'image/gif', type: 'IMAGE', extension: '.gif' };
    }
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
      return { mime: 'video/mp4', type: 'VIDEO', extension: '.mp4' };
    }
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) {
      return { mime: 'video/webm', type: 'VIDEO', extension: '.webm' };
    }
    return null;
  }

  private async assertOwnership(
    client: PoolClient,
    userId: string,
    productId: string,
  ): Promise<void> {
    const result = await client.query(
      `SELECT p.id
       FROM marketplace_products p
       INNER JOIN marketplace_sellers s ON s.id = p.seller_id
       WHERE p.id = $1 AND s.user_id = $2
       LIMIT 1`,
      [productId, userId],
    );
    if (!result.rows[0]) throw new ForbiddenException('You do not own this product.');
  }

  async upload(
    userId: string,
    productId: string,
    files: Express.Multer.File[] | undefined,
    requestInfo: RequestInfo,
  ) {
    if (!files?.length) throw new BadRequestException('Select at least one image or video.');
    if (files.length > this.maxFiles()) {
      throw new BadRequestException(`You can upload at most ${this.maxFiles()} files at once.`);
    }

    const prepared = files.map((file) => {
      if (!file.buffer?.length) throw new BadRequestException('An uploaded file is empty.');
      if (file.size > this.maxFileSize()) {
        throw new BadRequestException(`Each file must be no larger than ${this.maxFileSize()} bytes.`);
      }
      const detected = this.detectType(file.buffer);
      if (!detected || detected.mime !== file.mimetype) {
        throw new BadRequestException(`Unsupported or invalid file content: ${file.originalname}`);
      }
      return { file, detected, id: randomUUID(), key: '' };
    });

    const root = this.storageRoot();
    await mkdir(root, { recursive: true });

    for (const item of prepared) {
      item.key = `${item.id}${item.detected.extension}`;
    }

    const written: string[] = [];
    try {
      for (const item of prepared) {
        const path = join(root, item.key);
        await writeFile(path, item.file.buffer, { flag: 'wx' });
        written.push(path);
      }

      const rows = await this.database.withTransaction(async (client) => {
        await this.assertOwnership(client, userId, productId);

        const inserted: StoredMedia[] = [];
        for (let index = 0; index < prepared.length; index += 1) {
          const item = prepared[index];
          const result = await client.query<StoredMedia>(
            `INSERT INTO marketplace_product_media
              (id, product_id, media_type, storage_key, mime_type, file_size, display_order, alt_text)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id, product_id, media_type, storage_key, mime_type,
                       file_size, display_order, alt_text, created_at`,
            [
              item.id,
              productId,
              item.detected.type,
              item.key,
              item.detected.mime,
              item.file.size,
              index,
              item.file.originalname.slice(0, 500),
            ],
          );
          inserted.push(result.rows[0]);

          await this.audit.record({
            actorId: userId,
            action: 'MARKETPLACE_PRODUCT_MEDIA_UPLOADED',
            resourceType: 'MARKETPLACE_PRODUCT_MEDIA',
            resourceId: item.id,
            afterData: {
              productId,
              mediaType: item.detected.type,
              mimeType: item.detected.mime,
              fileSize: item.file.size,
            },
            ipAddress: requestInfo.ipAddress,
            userAgent: requestInfo.userAgent,
          }, client);
        }
        return inserted;
      });

      return rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        mediaType: row.media_type,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        displayOrder: row.display_order,
        altText: row.alt_text,
        createdAt: row.created_at,
        url: `/api/v1/marketplace/products/${productId}/media/${row.id}`,
      }));
    } catch (error) {
      await Promise.all(written.map((path) => unlink(path).catch(() => undefined)));
      throw error;
    }
  }

  async listSellerMedia(userId: string, productId: string) {
    await this.database.withTransaction(async (client) => {
      await this.assertOwnership(client, userId, productId);
    });

    const result = await this.database.query<StoredMedia>(
      `SELECT id, product_id, media_type, storage_key, mime_type, file_size,
              display_order, alt_text, created_at
       FROM marketplace_product_media
       WHERE product_id = $1
       ORDER BY display_order ASC, created_at ASC`,
      [productId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      mediaType: row.media_type,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      displayOrder: row.display_order,
      altText: row.alt_text,
      createdAt: row.created_at,
      url: `/api/v1/marketplace/products/${productId}/media/${row.id}`,
    }));
  }

  async delete(userId: string, productId: string, mediaId: string, requestInfo: RequestInfo) {
    const removed = await this.database.withTransaction(async (client) => {
      await this.assertOwnership(client, userId, productId);

      const result = await client.query<StoredMedia>(
        `DELETE FROM marketplace_product_media
         WHERE id = $1 AND product_id = $2
         RETURNING id, product_id, media_type, storage_key, mime_type, file_size,
                   display_order, alt_text, created_at`,
        [mediaId, productId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException('Product media not found.');

      await this.audit.record({
        actorId: userId,
        action: 'MARKETPLACE_PRODUCT_MEDIA_DELETED',
        resourceType: 'MARKETPLACE_PRODUCT_MEDIA',
        resourceId: mediaId,
        beforeData: {
          productId,
          mediaType: row.media_type,
          mimeType: row.mime_type,
          fileSize: row.file_size,
        },
        ipAddress: requestInfo.ipAddress,
        userAgent: requestInfo.userAgent,
      }, client);
      return row;
    });

    // Keys are generated UUIDs with a short, known extension.
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(removed.storage_key)) {
      throw new Error('Stored media key is invalid; file was not deleted.');
    }
    await unlink(join(this.storageRoot(), removed.storage_key)).catch(() => undefined);
    return { deleted: true, id: mediaId };
  }

  async getPublicMedia(productId: string, mediaId: string) {
    const result = await this.database.query<StoredMedia>(
      `SELECT m.id, m.product_id, m.media_type, m.storage_key,
              m.mime_type, m.file_size, m.display_order, m.alt_text, m.created_at
       FROM marketplace_product_media m
       INNER JOIN marketplace_products p ON p.id = m.product_id
       INNER JOIN marketplace_categories c ON c.id = p.category_id
       WHERE m.id = $1 AND m.product_id = $2
         AND p.status = 'LIVE' AND p.enabled = true AND c.enabled = true
       LIMIT 1`,
      [mediaId, productId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Product media not found.');

    if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(row.storage_key)) {
      throw new NotFoundException('Product media file is unavailable.');
    }
    const bytes = await readFile(join(this.storageRoot(), row.storage_key)).catch(() => {
      throw new NotFoundException('Product media file is unavailable.');
    });
    return { bytes, mimeType: row.mime_type, mediaType: row.media_type };
  }
}
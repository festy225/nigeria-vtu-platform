import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketplaceProductMediaService } from '../src/modules/sellers/marketplace-product-media.service';

describe('MarketplaceProductMediaService', () => {
  let root: string;
  let service: MarketplaceProductMediaService;

  const client = {
    query: jest.fn(),
  };

  const database = {
    query: jest.fn(),
    withTransaction: jest.fn(
      async (work: (value: typeof client) => Promise<unknown>) => work(client),
    ),
  };

  const audit = {
    record: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'MARKETPLACE_MEDIA_STORAGE_ROOT' ? root : fallback,
    ),
  };

  const userId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';
  const mediaId = '33333333-3333-4333-8333-333333333333';

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);

  function makeFile(
    buffer = jpeg,
    mimetype = 'image/jpeg',
    originalname = 'product.jpg',
  ): Express.Multer.File {
    return {
      fieldname: 'files',
      originalname,
      encoding: '7bit',
      mimetype,
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'chimzo-media-test-'));
    jest.clearAllMocks();

    client.query.mockReset();
    database.query.mockReset();
    database.withTransaction.mockImplementation(
      async (work: (value: typeof client) => Promise<unknown>) => work(client),
    );
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    database.query.mockResolvedValue({ rows: [], rowCount: 0 });
    audit.record.mockResolvedValue(undefined);

    service = new MarketplaceProductMediaService(
      database as never,
      audit as never,
      config as never,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rejects uploads with no files', async () => {
    await expect(
      service.upload(userId, productId, [], {}),
    ).rejects.toThrow(BadRequestException);

    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects invalid file signatures before writing or inserting media', async () => {
    const invalidFile = makeFile(
      Buffer.from('not an image'),
      'image/jpeg',
    );

    await expect(
      service.upload(userId, productId, [invalidFile], {}),
    ).rejects.toThrow(BadRequestException);

    expect(client.query).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('uploads a valid image for the owning seller and records an audit event', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: productId }] })
      .mockResolvedValueOnce({
        rows: [{
          id: mediaId,
          product_id: productId,
          media_type: 'IMAGE',
          storage_key: `${mediaId}.jpg`,
          mime_type: 'image/jpeg',
          file_size: jpeg.length,
          display_order: 0,
          alt_text: 'product.jpg',
          created_at: new Date('2026-01-01T00:00:00Z'),
        }],
      });

    const result = await service.upload(
      userId,
      productId,
      [makeFile()],
      { ipAddress: '127.0.0.1', userAgent: 'test-agent' },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: mediaId,
      productId,
      mediaType: 'IMAGE',
      mimeType: 'image/jpeg',
      url: `/api/v1/marketplace/products/${productId}/media/${mediaId}`,
    });

    const storedFiles = await (await import('node:fs/promises')).readdir(root);
    expect(storedFiles).toHaveLength(1);
    await expect(readFile(join(root, storedFiles[0]))).resolves.toEqual(jpeg);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: userId,
        action: 'MARKETPLACE_PRODUCT_MEDIA_UPLOADED',
        resourceId: expect.any(String),
      }),
      client,
    );

    const auditEvent = audit.record.mock.calls[0][0];
    expect(storedFiles[0]).toBe(`${auditEvent.resourceId}.jpg`);
  });

  it('rejects uploads when the authenticated user does not own the product and removes the written file', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.upload(userId, productId, [makeFile()], {}),
    ).rejects.toThrow(ForbiddenException);

    const files = await (await import('node:fs/promises')).readdir(root);
    expect(files).toHaveLength(0);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('returns public media only when the database query finds a live enabled product', async () => {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, `${mediaId}.jpg`), jpeg);

    database.query.mockResolvedValueOnce({
      rows: [{
        id: mediaId,
        product_id: productId,
        media_type: 'IMAGE',
        storage_key: `${mediaId}.jpg`,
        mime_type: 'image/jpeg',
        file_size: jpeg.length,
        display_order: 0,
        alt_text: 'product.jpg',
        created_at: new Date('2026-01-01T00:00:00Z'),
      }],
    });

    const result = await service.getPublicMedia(productId, mediaId);

    expect(result.bytes).toEqual(jpeg);
    expect(result.mimeType).toBe('image/jpeg');
    expect(String(database.query.mock.calls[0][0])).toContain("p.status = 'LIVE'");
    expect(String(database.query.mock.calls[0][0])).toContain('p.enabled = true');
    expect(String(database.query.mock.calls[0][0])).toContain('c.enabled = true');
  });

  it('returns not found when public media is not available for the product', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getPublicMedia(productId, mediaId),
    ).rejects.toThrow(NotFoundException);
  });
});
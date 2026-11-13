import { BadRequestException, ConflictException } from '@nestjs/common';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SellerApplicationDocumentService } from '../src/modules/sellers/seller-application-document.service';

describe('SellerApplicationDocumentService', () => {
  let root: string;
  const client = { query: jest.fn() };
  const database = {
    query: jest.fn(),
    withTransaction: jest.fn((work: (c: typeof client) => unknown) => work(client)),
  };
  const config = { get: jest.fn(() => root) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  let service: SellerApplicationDocumentService;

  const pdf = Buffer.from('%PDF-1.7 test document');
  const file = (buffer = pdf, mimetype = 'application/pdf') => ({
    buffer, mimetype, size: buffer.length, originalname: 'identity.pdf',
  }) as Express.Multer.File;

  beforeEach(async () => {
    jest.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), 'chimzo-seller-docs-'));
    config.get.mockReturnValue(root);
    client.query.mockResolvedValue({ rows: [{ id: 'seller-1',
      onboarding_status: 'DRAFT',
      business_registration_status: 'UNREGISTERED' }], rowCount: 1 });
    database.withTransaction.mockImplementation(
      (work: (c: typeof client) => unknown) => work(client),
    );
    audit.record.mockResolvedValue(undefined);
    service = new SellerApplicationDocumentService(
      database as never, config as never, audit as never,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rejects a missing file', async () => {
    await expect(service.upload('user-1', 'IDENTITY_DOCUMENT', undefined, {}))
      .rejects.toThrow(BadRequestException);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects a file whose content signature does not match its MIME type', async () => {
    await expect(service.upload('user-1', 'IDENTITY_DOCUMENT',
      file(Buffer.from('not a PDF')), {})).rejects.toThrow(BadRequestException);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects CAC documents for unregistered businesses', async () => {
    await expect(service.upload('user-1', 'CAC_CERTIFICATE', file(), {}))
      .rejects.toThrow(BadRequestException);
    expect(await readdir(root)).toHaveLength(0);
  });

  it('rejects uploads when the application is no longer editable and cleans up the file', async () => {
    client.query.mockResolvedValueOnce({ rows: [{
      id: 'seller-1', onboarding_status: 'UNDER_REVIEW',
      business_registration_status: 'UNREGISTERED',
    }], rowCount: 1 });

    await expect(service.upload('user-1', 'IDENTITY_DOCUMENT', file(), {}))
      .rejects.toThrow(ConflictException);
    expect(await readdir(root)).toHaveLength(0);
  });

  it('stores a valid PDF and audits the upload', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{
        id: 'seller-1', onboarding_status: 'DRAFT',
        business_registration_status: 'UNREGISTERED',
      }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1',
        document_type: 'IDENTITY_DOCUMENT', verification_status: 'PENDING' }],
        rowCount: 1 });

    await expect(service.upload('user-1', 'IDENTITY_DOCUMENT', file(), {}))
      .resolves.toMatchObject({ id: 'document-1' });

    expect(await readdir(root)).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SELLER_APPLICATION_DOCUMENT_UPLOADED' }),
      client,
    );
  });
});

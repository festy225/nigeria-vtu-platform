import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from '../src/modules/auth/auth.service';

describe('AuthService', () => {
  const db = { withTransaction: jest.fn(), query: jest.fn() };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
  const config = { getOrThrow: jest.fn().mockReturnValue('test-secret'), get: jest.fn((key: string, fallback: string) => fallback) };
  beforeEach(() => jest.clearAllMocks());

  it('issues access and refresh tokens for a valid session', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const service = new AuthService(db as never, jwt as never, config as never);
    const result = await service.issueSession({ id: 'u1', email: 'a@example.com', phone: null, roles: ['CUSTOMER'] }, { headers: {}, ip: '127.0.0.1' } as never);
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(db.query).toHaveBeenCalled();
  });
});

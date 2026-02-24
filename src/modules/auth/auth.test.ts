import { AuthService } from './auth.service';
import { UnauthorizedError, ForbiddenError, ConflictError } from '../../lib/errors';

// Mock prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    tenant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock('../../lib/audit', () => ({ createAuditLog: jest.fn() }));

import { prisma } from '../../lib/prisma';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockTenant = { id: 'tenant-1', slug: 'alpha', name: 'Alpha', isActive: true };
const mockUser = {
  id: 'user-1',
  email: 'test@alpha.com',
  passwordHash: '',
  firstName: 'Test',
  lastName: 'User',
  role: 'STUDENT',
  isApproved: true,
  isActive: true,
  tenantId: 'tenant-1',
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should throw UnauthorizedError if tenant not found', async () => {
      (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.login({ email: 'a@a.com', password: 'pw', tenantSlug: 'bad' }))
        .rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if user not found', async () => {
      (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.login({ email: 'a@a.com', password: 'pw', tenantSlug: 'alpha' }))
        .rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError if user not approved', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('Password1', 12);
      (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser, passwordHash: hash, isApproved: false,
      });
      await expect(service.login({ email: 'test@alpha.com', password: 'Password1', tenantSlug: 'alpha' }))
        .rejects.toThrow(ForbiddenError);
    });

    it('should return tokens on successful login', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('Password1', 12);
      (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser, passwordHash: hash,
      });
      (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.login({ email: 'test@alpha.com', password: 'Password1', tenantSlug: 'alpha' });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('test@alpha.com');
    });
  });

  describe('register', () => {
    it('should throw ConflictError if email already exists', async () => {
      (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      await expect(service.register({
        email: 'test@alpha.com', password: 'Password1',
        firstName: 'A', lastName: 'B', tenantSlug: 'alpha'
      })).rejects.toThrow(ConflictError);
    });

    it('should create user with hashed password', async () => {
      (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'new-user', email: 'new@alpha.com', firstName: 'New', lastName: 'User',
        role: 'STUDENT', isApproved: false,
      });

      const result = await service.register({
        email: 'new@alpha.com', password: 'Password1',
        firstName: 'New', lastName: 'User', tenantSlug: 'alpha'
      });
      expect(result.user.role).toBe('STUDENT');
      expect(result.user.isApproved).toBe(false);
    });
  });
});

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } from '../../lib/jwt';
import { UnauthorizedError, NotFoundError, ConflictError, ForbiddenError } from '../../lib/errors';
import { createAuditLog } from '../../lib/audit';

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantSlug: string;
}

export interface LoginDto {
  email: string;
  password: string;
  tenantSlug: string;
}

export class AuthService {
  async register(dto: RegisterDto) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant) throw new NotFoundError('Tenant');
    if (!tenant.isActive) throw new ForbiddenError('Tenant is inactive');

    const existing = await prisma.user.findUnique({
      where: { email_tenantId: { email: dto.email, tenantId: tenant.id } },
    });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'STUDENT',
        isApproved: false,
        tenantId: tenant.id,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isApproved: true },
    });

    await createAuditLog({
      userId: user.id,
      tenantId: tenant.id,
      action: 'USER_REGISTERED',
      resource: 'user',
      resourceId: user.id,
      after: { email: user.email, role: user.role },
    });

    return { user, message: 'Registration successful. Await admin approval.' };
  }

  async login(dto: LoginDto, ipAddress?: string) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant || !tenant.isActive) throw new UnauthorizedError('Invalid credentials');

    const user = await prisma.user.findUnique({
      where: { email_tenantId: { email: dto.email, tenantId: tenant.id } },
    });

    if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    if (!user.isApproved) throw new ForbiddenError('Account pending approval');

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const tokenId = uuidv4();

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        token: refreshToken,
        userId: user.id,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    await createAuditLog({
      userId: user.id,
      tenantId: tenant.id,
      action: 'USER_LOGIN',
      resource: 'auth',
      ipAddress,
      after: { email: user.email },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: dto.tenantSlug,
      },
    };
  }

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive || !user.isApproved) {
      throw new UnauthorizedError('User inactive');
    }

    // Rotate refresh token
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const newPayload = { userId: user.id, email: user.email, role: user.role, tenantId: user.tenantId };
    const newAccessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isApproved: true, tenantId: true,
        tenant: { select: { name: true, slug: true } },
      },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }
}

export const authService = new AuthService();

import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertStaffAuthorized, resolveAllowedStaffIds } from '../staff-auth/staff-auth';

type WechatCodeSession = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export type AuthIdentity = {
  userId: string;
  openId: string;
  role: UserRole;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function resolveSessionTtlMs() {
  const days = Number(process.env.SESSION_EXPIRES_DAYS || 30);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
  return safeDays * 24 * 60 * 60 * 1000;
}

function isWechatAuthConfigured() {
  return !!(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
}

function isOpenIdHeaderFallbackEnabled() {
  const configuredValue = process.env.ALLOW_OPENID_HEADER_AUTH;

  if (configuredValue !== undefined) {
    return ['1', 'true', 'yes', 'on'].includes(configuredValue.trim().toLowerCase());
  }

  return process.env.NODE_ENV !== 'production';
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async loginWithWechat(code?: string) {
    const normalizedCode = `${code || ''}`.trim();

    if (!normalizedCode) {
      throw new BadRequestException({
        error: 'Missing login code',
        code: 'WECHAT_LOGIN_CODE_MISSING'
      });
    }

    if (!isWechatAuthConfigured()) {
      throw new BadRequestException({
        error: 'Wechat auth is not configured',
        code: 'WECHAT_AUTH_NOT_CONFIGURED'
      });
    }

    const session = await this.exchangeCodeForSession(normalizedCode);
    const openId = `${session.openid || ''}`.trim();

    if (!openId) {
      throw new UnauthorizedException({
        error: 'Wechat login failed',
        code: 'WECHAT_OPENID_MISSING'
      });
    }

    const role = resolveAllowedStaffIds().includes(openId) ? UserRole.STAFF : UserRole.CUSTOMER;
    const existingUser = await this.prisma.user.findUnique({
      where: { openId },
      select: { status: true }
    });

    if (existingUser?.status === UserStatus.DISABLED) {
      throw new UnauthorizedException({
        error: 'Account disabled',
        code: 'ACCOUNT_DISABLED'
      });
    }

    const user = await this.prisma.user.upsert({
      where: { openId },
      update: {
        role
      },
      create: {
        openId,
        role,
        status: UserStatus.ACTIVE
      }
    });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + resolveSessionTtlMs());

    await this.prisma.authSession.deleteMany({
      where: {
        expiresAt: {
          lte: new Date()
        }
      }
    });

    await this.prisma.authSession.create({
      data: {
        tokenHash: sha256(token),
        userId: user.id,
        openId,
        role,
        expiresAt
      }
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        openId,
        role: role.toLowerCase()
      }
    };
  }

  async logout(authorization?: string) {
    const token = this.resolveBearerToken(authorization);

    if (token) {
      await this.prisma.authSession.deleteMany({
        where: {
          tokenHash: sha256(token)
        }
      });
    }

    return { ok: true };
  }

  async getMe(authorization?: string) {
    const identity = await this.resolveIdentityFromAuthorization(authorization);

    if (!identity) {
      throw new UnauthorizedException({
        error: 'Session unauthorized',
        code: 'SESSION_UNAUTHORIZED'
      });
    }

    return {
      user: {
        id: identity.userId,
        openId: identity.openId,
        role: identity.role.toLowerCase()
      }
    };
  }

  async resolveIdentityFromAuthorization(authorization?: string): Promise<AuthIdentity | null> {
    const token = this.resolveBearerToken(authorization);

    if (!token) {
      return null;
    }

    const session = await this.prisma.authSession.findUnique({
      where: {
        tokenHash: sha256(token)
      }
    });

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    // Auth sessions intentionally keep a snapshot of the role for auditability,
    // but the user record remains the source of truth for revocation. A token
    // must stop working as soon as the account is disabled or its role changes.
    const user = await this.prisma.user.findUnique({
      where: {
        id: session.userId
      },
      select: {
        id: true,
        openId: true,
        role: true,
        status: true
      }
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.openId !== session.openId ||
      user.role !== session.role
    ) {
      return null;
    }

    return {
      userId: user.id,
      openId: user.openId,
      role: user.role
    };
  }

  async resolveCustomerOpenId(authorization?: string, fallbackOpenId?: string) {
    const hasBearerToken = !!this.resolveBearerToken(authorization);
    const identity = await this.resolveIdentityFromAuthorization(authorization);

    // A supplied Bearer token is authoritative. Do not silently downgrade an
    // invalid, expired, disabled, or role-stale session to a develop header.
    if (identity) {
      if (identity.role !== UserRole.CUSTOMER) {
        throw new UnauthorizedException({
          error: 'Customer unauthorized',
          code: 'CUSTOMER_UNAUTHORIZED'
        });
      }
      return identity.openId;
    }

    if (hasBearerToken) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    const normalizedFallbackOpenId = `${fallbackOpenId || ''}`.trim();
    if (
      normalizedFallbackOpenId &&
      resolveAllowedStaffIds().includes(normalizedFallbackOpenId)
    ) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    return isOpenIdHeaderFallbackEnabled() ? normalizedFallbackOpenId : '';
  }

  async resolveStaffOpenId(authorization?: string, fallbackOpenId?: string) {
    const hasBearerToken = !!this.resolveBearerToken(authorization);
    const identity = await this.resolveIdentityFromAuthorization(authorization);

    if (identity) {
      if (identity.role !== UserRole.STAFF || !resolveAllowedStaffIds().includes(identity.openId)) {
        throw new UnauthorizedException({
          error: 'Staff unauthorized',
          code: 'STAFF_UNAUTHORIZED'
        });
      }

      return assertStaffAuthorized(identity.openId);
    }

    if (hasBearerToken) {
      throw new UnauthorizedException({
        error: 'Staff unauthorized',
        code: 'STAFF_UNAUTHORIZED'
      });
    }

    return isOpenIdHeaderFallbackEnabled() ? `${fallbackOpenId || ''}`.trim() : '';
  }

  private resolveBearerToken(authorization?: string) {
    const value = `${authorization || ''}`.trim();
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
  }

  private async exchangeCodeForSession(code: string): Promise<WechatCodeSession> {
    const params = new URLSearchParams({
      appid: `${process.env.WECHAT_APP_ID || ''}`,
      secret: `${process.env.WECHAT_APP_SECRET || ''}`,
      js_code: code,
      grant_type: 'authorization_code'
    });
    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`);
    const payload = (await response.json()) as WechatCodeSession;

    if (!response.ok || payload.errcode) {
      throw new UnauthorizedException({
        error: 'Wechat login failed',
        code: 'WECHAT_LOGIN_FAILED',
        detail: payload.errmsg || `HTTP ${response.status}`
      });
    }

    return payload;
  }
}

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, JWTPayload } from 'jose';

export interface AuthUser {
  id: string;
}

@Injectable()
export class AuthService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private readonly logger = new Logger(AuthService.name);

  async validateToken(token: string): Promise<AuthUser> {
    try {
      const { alg } = decodeProtectedHeader(token);
      const { payload } =
        alg && alg.startsWith('HS') ? await this.verifyHmac(token) : await this.verifyJwks(token);
      const userId = this.extractUserId(payload);
      if (!userId) {
        throw new UnauthorizedException('Invalid Supabase token payload');
      }
      return { id: userId };
    } catch (err) {
      this.logger.error(`JWT validation failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractUserId(payload: JWTPayload): string | undefined {
    if (payload.sub) {
      return payload.sub;
    }
    const user = (payload as any).user;
    if (user?.id) {
      return user.id;
    }
    return undefined;
  }

  private getJwksUrl(): string {
    const directUrl = process.env.SUPABASE_JWKS_URL;
    if (directUrl) {
      return directUrl;
    }
    const projectUrl = process.env.SUPABASE_PROJECT_URL;
    if (projectUrl) {
      return `${projectUrl.replace(/\/$/, '')}/auth/v1/keys`;
    }
    throw new UnauthorizedException('Supabase JWKS URL is not configured');
  }

  private ensureJwks() {
    if (!this.jwks) {
      const jwksUrl = new URL(this.getJwksUrl());
      this.jwks = createRemoteJWKSet(jwksUrl);
    }
    return this.jwks;
  }

  private async verifyJwks(token: string) {
    const jwks = this.ensureJwks();
    return jwtVerify(token, jwks, { clockTolerance: 5 });
  }

  private async verifyHmac(token: string) {
    const secret = this.getHmacSecret();
    const key = new TextEncoder().encode(secret);
    return jwtVerify(token, key, { clockTolerance: 5 });
  }

  private getHmacSecret(): string {
    const secret =
      process.env.SUPABASE_JWT_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY;
    if (!secret) {
      throw new UnauthorizedException('Supabase JWT secret is not configured for HS tokens');
    }
    return secret;
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface AuthUser {
  id: string;
}

@Injectable()
export class AuthService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  private getJwksUrl(): string {
    const directUrl = process.env.SUPABASE_JWKS_URL;
    if (directUrl) {
      return directUrl;
    }
    const projectUrl = process.env.SUPABASE_PROJECT_URL;
    if (projectUrl) {
      return `${projectUrl.replace(/\\/$/, '')}/auth/v1/keys`;
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

  async validateToken(token: string): Promise<AuthUser> {
    try {
      const jwks = this.ensureJwks();
      const { payload } = await jwtVerify(token, jwks, {
        clockTolerance: 5,
      });
      const userId = this.extractUserId(payload);
      if (!userId) {
        throw new UnauthorizedException('Invalid Supabase token payload');
      }
      return { id: userId };
    } catch (err) {
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
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import apn from 'apn';
import { DEVICE_TOKENS_REPOSITORY, DeviceTokensRepository } from './device-tokens.repository';
import { EpisodeStatus } from '../domain/types';

type EpisodeNotificationInput = {
  episodeId: string;
  status: EpisodeStatus;
  title?: string;
  description?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly apnsBundleId?: string;
  private readonly apnsProvider?: apn.Provider;

  constructor(
    @Inject(DEVICE_TOKENS_REPOSITORY) private readonly deviceTokens: DeviceTokensRepository,
    private readonly configService: ConfigService,
  ) {
    this.apnsBundleId = this.configService.get<string>('APNS_BUNDLE_ID') ?? undefined;
    this.apnsProvider = this.buildApnsProvider();
  }

  async registerDevice(userId: string, token: string, platform = 'ios') {
    if (!token?.trim()) {
      throw new Error('Device token is required');
    }
    return this.deviceTokens.upsert(userId, token.trim(), platform);
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    if (!token?.trim()) {
      return;
    }
    await this.deviceTokens.delete(userId, token.trim());
  }

  async notifyEpisodeStatus(userId: string, input: EpisodeNotificationInput): Promise<void> {
    if (!input.episodeId || !input.status) {
      return;
    }
    const tokens = await this.deviceTokens.listByUser(userId);
    const iosTokens = tokens.filter((t) => t.platform === 'ios' || !t.platform);
    if (!iosTokens.length) {
      return;
    }
    if (!this.apnsProvider || !this.apnsBundleId) {
      this.logger.warn('APNs not configured; skipping episode notification send');
      return;
    }

    const alertTitle =
      input.status === 'ready' ? 'Your episode is ready' : 'Episode generation failed';
    const body =
      input.status === 'ready'
        ? input.title || 'Tap to listen now.'
        : input.description || 'Please try again.';

    const notification = new apn.Notification({
      topic: this.apnsBundleId,
      sound: 'default',
      payload: { episodeId: input.episodeId, status: input.status },
      alert: { title: alertTitle, body },
      expiry: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    });

    try {
      const response = await this.apnsProvider.send(
        notification,
        iosTokens.map((t) => t.token),
      );
      const failedCount = response.failed?.length ?? 0;
      if (failedCount > 0) {
        this.logger.warn(
          `APNs send had ${failedCount} failure(s): ${JSON.stringify(
            response.failed.map((f) => f.response?.reason || f.error?.message || 'unknown'),
          )}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `APNs send failed for episode ${input.episodeId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private buildApnsProvider(): apn.Provider | undefined {
    const keyId = this.configService.get<string>('APNS_KEY_ID');
    const teamId = this.configService.get<string>('APNS_TEAM_ID');
    const bundleId = this.configService.get<string>('APNS_BUNDLE_ID');
    const keyPath = this.configService.get<string>('APNS_KEY_PATH');
    const rawKey = this.configService.get<string>('APNS_PRIVATE_KEY');
    const useSandbox = this.getBoolean(this.configService.get<string>('APNS_USE_SANDBOX'));

    let key: string | Buffer | undefined = undefined;
    if (rawKey && rawKey.trim()) {
      const cleaned = rawKey.replace(/\\n/g, '\n');
      key = Buffer.from(cleaned, 'utf8');
    } else if (keyPath) {
      try {
        const content = fs.readFileSync(path.resolve(keyPath), 'utf8');
        key = Buffer.from(content, 'utf8');
      } catch (error) {
        this.logger.error(
          `Failed to read APNS_KEY_PATH at ${keyPath}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    if (!keyId || !teamId || !bundleId || !key) {
      this.logger.warn('APNs credentials are missing; push sends will be skipped');
      return undefined;
    }

    return new apn.Provider({
      token: {
        key,
        keyId,
        teamId,
      },
      production: !useSandbox,
    });
  }

  private getBoolean(value?: string | boolean | null): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }
}

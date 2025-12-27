export const DEVICE_TOKENS_REPOSITORY = 'DEVICE_TOKENS_REPOSITORY';

export interface DeviceToken {
  id: string;
  userId: string;
  platform: string;
  token: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceTokensRepository {
  upsert(userId: string, token: string, platform: string): Promise<DeviceToken>;
  listByUser(userId: string): Promise<DeviceToken[]>;
  delete(userId: string, token: string): Promise<void>;
}

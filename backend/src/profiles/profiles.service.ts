import { Inject, Injectable } from '@nestjs/common';
import { UserProfile } from '../domain/types';
import { PROFILES_REPOSITORY, ProfilesRepository } from './profiles.repository';

@Injectable()
export class ProfilesService {
  constructor(@Inject(PROFILES_REPOSITORY) private readonly repository: ProfilesRepository) {}

  getProfile(userId: string): Promise<UserProfile | undefined> {
    return this.repository.getByUserId(userId);
  }

  async upsertTimezone(userId: string, timezone: string): Promise<UserProfile> {
    const updated = await this.repository.updateTimezone(userId, timezone);
    if (!updated) {
      throw new Error('Failed to persist timezone');
    }
    return updated;
  }

  async saveProfile(profile: UserProfile): Promise<UserProfile> {
    return this.repository.upsertProfile(profile);
  }
}

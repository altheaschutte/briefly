import { UserProfile } from '../domain/types';

export const PROFILES_REPOSITORY = 'PROFILES_REPOSITORY';

export interface ProfilesRepository {
  getByUserId(userId: string): Promise<UserProfile | undefined>;
  upsertProfile(profile: UserProfile): Promise<UserProfile>;
  updateTimezone(userId: string, timezone: string): Promise<UserProfile | undefined>;
}

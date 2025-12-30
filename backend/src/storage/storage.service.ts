import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private bucket?: string;
  private region?: string;
  private client?: S3Client;
  private imageBucket?: string;
  private imageRegion?: string;
  private imageClient?: S3Client;
  private readonly driver: 's3' | 'local';
  private readonly audioSignedUrlTtl: number;

  constructor(private readonly configService: ConfigService) {
    this.driver = (this.configService.get<string>('STORAGE_DRIVER') || 's3').toLowerCase() === 'local' ? 'local' : 's3';
    this.audioSignedUrlTtl = Number(this.configService.get<string>('AUDIO_URL_EXPIRY_SECONDS')) || 60 * 60;
  }

  async uploadAudio(buffer: Buffer, key?: string): Promise<{ key: string; url: string; localPath?: string }> {
    if (this.driver === 'local') {
      const objectKey = key ?? `audio/${uuid()}.mp3`;
      const fullPath = await this.saveLocalCopy(objectKey, buffer);
      return { key: fullPath, url: `file://${fullPath}`, localPath: fullPath };
    }

    const { bucket, client } = this.getClient();
    const objectKey = this.normalizeKey(key ?? `audio/${uuid()}.mp3`);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: 'audio/mpeg',
      }),
    );
    let localPath: string | undefined;
    if (this.shouldMirrorToLocal()) {
      try {
        localPath = await this.saveLocalCopy(objectKey, buffer);
      } catch (error) {
        this.logger.warn(`Failed to save local audio copy for ${objectKey}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return { key: objectKey, url: objectKey, localPath };
  }

  async uploadImage(
    buffer: Buffer,
    key?: string,
    options?: { contentType?: string; cacheControl?: string },
  ): Promise<{ key: string; url: string; localPath?: string }> {
    if (this.driver === 'local') {
      const objectKey = key ?? `images/${uuid()}.png`;
      const fullPath = await this.saveLocalCopy(objectKey, buffer);
      return { key: fullPath, url: `file://${fullPath}`, localPath: fullPath };
    }

    const { bucket, region, client } = this.getImageClient();
    const objectKey = key ?? `images/${uuid()}.png`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: options?.contentType ?? 'image/png',
        CacheControl: options?.cacheControl,
      }),
    );
    let localPath: string | undefined;
    if (this.shouldMirrorToLocal()) {
      try {
        localPath = await this.saveLocalCopy(objectKey, buffer);
      } catch (error) {
        this.logger.warn(
          `Failed to save local image copy for ${objectKey}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    return { key: objectKey, url: this.getPublicUrlForBucket(bucket, region, objectKey), localPath };
  }

  async getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    if (this.driver === 'local') {
      return key.startsWith('file://') ? key : `file://${key}`;
    }
    const ttl = expiresInSeconds ?? this.audioSignedUrlTtl;
    const { bucket, client } = this.getClient();
    const normalizedKey = this.normalizeKey(key);
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: normalizedKey,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to access audio object ${bucket}/${normalizedKey}: ${this.describeS3Error(error)}`,
      );
      throw error;
    }
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    });
    return getS3SignedUrl(client, command, { expiresIn: ttl });
  }

  async fetchAudioBuffer(keyOrUrl: string): Promise<Buffer> {
    if (!keyOrUrl) {
      throw new Error('Audio key or URL is required');
    }

    if (/^https?:\/\//i.test(keyOrUrl)) {
      const response = await axios.get<ArrayBuffer>(keyOrUrl, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    }

    if (this.driver === 'local' || keyOrUrl.startsWith('file://')) {
      const localPath = keyOrUrl.replace(/^file:\/\//, '');
      return fs.readFile(localPath);
    }

    const normalizedKey = this.normalizeKey(keyOrUrl);
    const { bucket, client } = this.getClient();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
      }),
    );
    const body = response.Body as Readable | undefined;
    if (!body) {
      throw new Error(`Empty response when fetching audio ${normalizedKey}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getEpisodeAudioSignedUrl(userId: string, episodeId: string, key?: string): Promise<string> {
    const objectKey = this.normalizeKey(key ?? `${userId}/${episodeId}.mp3`);
    return this.getSignedUrl(objectKey);
  }

  private shouldMirrorToLocal(): boolean {
    const flag = this.configService.get<string>('SAVE_LOCAL_AUDIO_COPY');
    if (flag !== undefined) {
      return flag.toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'production';
  }

  private normalizeKey(keyOrUrl: string): string {
    const s3Match = keyOrUrl.match(/^s3:\/\/[^/]+\/(.+)$/i);
    if (s3Match?.[1]) {
      return s3Match[1];
    }
    if (!/^https?:\/\//i.test(keyOrUrl)) {
      return keyOrUrl.replace(/^file:\/\//, '').replace(/^\/+/, '');
    }
    try {
      const url = new URL(keyOrUrl);
      return url.pathname.replace(/^\/+/, '');
    } catch {
      return keyOrUrl;
    }
  }

  private describeS3Error(error: unknown): string {
    const metadata = (error as any)?.$metadata;
    const code = (error as any)?.Code || (error as any)?.code || (error as any)?.name;
    const status = metadata?.httpStatusCode;
    const message = error instanceof Error ? error.message : String(error);
    const parts = [];
    if (code) parts.push(`code=${code}`);
    if (status) parts.push(`status=${status}`);
    parts.push(message);
    return parts.join(' | ');
  }

  private async saveLocalCopy(objectKey: string, buffer: Buffer): Promise<string> {
    const baseDir = path.resolve(process.cwd(), 'tmp');
    const fullPath = path.join(baseDir, objectKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return fullPath;
  }

  private getClient(): { bucket: string; region: string; client: S3Client } {
    if (this.client && this.bucket && this.region) {
      return { bucket: this.bucket, region: this.region, client: this.client };
    }

    const { bucket, region, accessKeyId, secretAccessKey, endpoint } = this.requireAudioConfigBundle();
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    this.bucket = bucket;
    this.region = region;
    return { bucket, region, client: this.client };
  }

  private getImageClient(): { bucket: string; region: string; client: S3Client } {
    if (this.imageClient && this.imageBucket && this.imageRegion) {
      return { bucket: this.imageBucket, region: this.imageRegion, client: this.imageClient };
    }

    const { bucket, region, accessKeyId, secretAccessKey, endpoint } = this.requireImageConfigBundle();
    this.imageClient = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    this.imageBucket = bucket;
    this.imageRegion = region;
    return { bucket, region, client: this.imageClient };
  }

  private requireAudioConfigBundle() {
    const bucket =
      this.configService.get<string>('AUDIO_BUCKET_NAME') ||
      this.configService.get<string>('S3_BUCKET_NAME');
    if (!bucket) {
      throw new Error('Missing required env var: AUDIO_BUCKET_NAME or S3_BUCKET_NAME');
    }
    const region =
      this.configService.get<string>('AUDIO_S3_REGION') ||
      this.requireConfig('S3_REGION');
    const accessKeyId = this.requireConfig('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.requireConfig('S3_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    return { bucket, region, accessKeyId, secretAccessKey, endpoint };
  }

  private requireImageConfigBundle() {
    const base = this.requireAudioConfigBundle();
    const imageBucket = this.configService.get<string>('S3_IMAGES_BUCKET_NAME');
    const imageRegion = this.configService.get<string>('S3_IMAGES_REGION');
    return {
      ...base,
      bucket: imageBucket || base.bucket,
      region: imageRegion || base.region,
    };
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }

  getPublicUrl(key: string): string {
    if (this.driver === 'local') {
      return key.startsWith('file://') ? key : `file://${path.resolve(key)}`;
    }
    const { bucket, region } = this.requireAudioConfigBundle();
    return this.getPublicUrlForBucket(bucket, region, key);
  }

  private getPublicUrlForBucket(bucket: string, region: string, key: string): string {
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}

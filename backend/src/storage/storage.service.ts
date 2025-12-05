import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';

@Injectable()
export class StorageService {
  private bucket?: string;
  private region?: string;
  private client?: S3Client;

  constructor(private readonly configService: ConfigService) {}

  async uploadAudio(buffer: Buffer, key?: string): Promise<{ key: string; url: string }> {
    const { bucket, client } = this.getClient();
    const objectKey = key ?? `audio/${uuid()}.mp3`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: 'audio/mpeg',
      }),
    );
    return { key: objectKey, url: this.getPublicUrl(objectKey) };
  }

  async getSignedUrl(key: string, expiresInSeconds = 60 * 60 * 6): Promise<string> {
    const { bucket, client } = this.getClient();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    return getS3SignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  getPublicUrl(key: string): string {
    const { bucket, region } = this.requireConfigBundle();
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  private getClient(): { bucket: string; region: string; client: S3Client } {
    if (this.client && this.bucket && this.region) {
      return { bucket: this.bucket, region: this.region, client: this.client };
    }

    const { bucket, region, accessKeyId, secretAccessKey, endpoint } = this.requireConfigBundle();
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

  private requireConfigBundle() {
    const bucket = this.requireConfig('S3_BUCKET_NAME');
    const region = this.requireConfig('S3_REGION');
    const accessKeyId = this.requireConfig('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.requireConfig('S3_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    return { bucket, region, accessKeyId, secretAccessKey, endpoint };
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }
}

import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  s3Region: process.env.AWS_REGION || process.env.S3_REGION || '',
  s3Bucket: process.env.S3_BUCKET || '',
  s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  recordingsDirectory: process.env.RECORDINGS_DIRECTORY || 'recordings',
}));

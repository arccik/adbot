import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 3600),
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  webAppUrl: process.env.WEB_APP_URL ?? "",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3BucketName: process.env.S3_BUCKET_NAME ?? "",
  s3Region: process.env.AWS_REGION ?? "us-east-1",
  cloudFrontUrl: process.env.CLOUDFRONT_URL ?? "",
  cloudFrontKeyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID ?? "",
  cloudFrontPrivateKey: process.env.CLOUDFRONT_PRIVATE_KEY ?? "",
  cloudFrontTtlSeconds: Number(process.env.CLOUDFRONT_URL_TTL_SECONDS ?? 600),
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  minWatchSeconds: Number(process.env.MIN_WATCH_SECONDS ?? 15),
  maxDailyCoins: Number(process.env.MAX_DAILY_COINS ?? 200),
  coinsPerWatch: Number(process.env.COINS_PER_WATCH ?? 5),
  coinsPerCampaign: Number(process.env.COINS_PER_CAMPAIGN ?? 50),
  adminApiKey: process.env.ADMIN_API_KEY ?? "",
  fraudIpDailyLimit: Number(process.env.FRAUD_IP_DAILY_LIMIT ?? 5),
  fraudFingerprintDailyLimit: Number(process.env.FRAUD_FINGERPRINT_DAILY_LIMIT ?? 5)
};

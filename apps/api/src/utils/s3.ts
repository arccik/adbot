import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSignedUrl as getSignedCloudFrontUrl } from "@aws-sdk/cloudfront-signer";
import { config } from "../config";

const s3 = new S3Client({
  region: config.s3Region
});

export async function signUpload(key: string, contentType: string, sizeBytes: number) {
  if (!config.s3BucketName) {
    throw new Error("S3_BUCKET_NAME not configured");
  }
  const command = new PutObjectCommand({
    Bucket: config.s3BucketName,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return uploadUrl;
}

export function publicMediaUrl(key: string) {
  if (config.cloudFrontUrl) {
    const base = `${config.cloudFrontUrl.replace(/\/$/, "")}/${key}`;
    if (config.cloudFrontKeyPairId && config.cloudFrontPrivateKey) {
      const privateKey = Buffer.from(config.cloudFrontPrivateKey, "base64").toString("utf8");
      return getSignedCloudFrontUrl({
        url: base,
        keyPairId: config.cloudFrontKeyPairId,
        privateKey,
        dateLessThan: new Date(Date.now() + config.cloudFrontTtlSeconds * 1000).toISOString()
      });
    }
    return base;
  }
  if (config.s3Bucket) {
    return `${config.s3Bucket.replace(/\/$/, "")}/${key}`;
  }
  return key;
}

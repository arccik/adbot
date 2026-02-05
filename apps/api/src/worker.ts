import { prisma } from "./prisma";
import { publicMediaUrl } from "./utils/s3";
import { probeDurationSeconds } from "./utils/ffprobe";

const intervalMs = 30_000;

async function processJob() {
  const job = await prisma.mediaIngestJob.findFirst({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: 5 }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!job) return;

  const claimed = await prisma.mediaIngestJob.updateMany({
    where: { id: job.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PROCESSING", attempts: { increment: 1 } }
  });

  if (claimed.count === 0) return;

  try {
    const ad = await prisma.ad.findUnique({ where: { id: job.adId } });
    if (!ad) {
      await prisma.mediaIngestJob.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: "ad_not_found" }
      });
      return;
    }
    const mediaUrl = publicMediaUrl(ad.mediaKey);
    const duration = await probeDurationSeconds(mediaUrl);
    if (!duration) {
      await prisma.mediaIngestJob.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: "probe_failed" }
      });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.ad.update({
        where: { id: ad.id },
        data: { mediaDurationSeconds: duration }
      });
      await tx.mediaIngestJob.update({
        where: { id: job.id },
        data: { status: "DONE", lastError: null }
      });
    });
  } catch (error) {
    await prisma.mediaIngestJob.update({
      where: { id: job.id },
      data: { status: "FAILED", lastError: (error as Error).message }
    });
  }
}

setInterval(() => {
  processJob().catch(() => {
    // swallow errors to keep loop alive
  });
}, intervalMs);

console.log("Media ingest worker started.");

process.once("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

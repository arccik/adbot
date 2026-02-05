import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { config } from "../config";
import { authRequired } from "../middleware/auth";
import { publicMediaUrl, signUpload } from "../utils/s3";
import { probeDurationSeconds } from "../utils/ffprobe";

const router = Router();

function headerString(value: string | string[] | undefined) {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

router.get("/queue", authRequired, async (req, res) => {
  const userId = req.user!.sub;

  const recentViews = await prisma.adView.findMany({
    where: {
      viewerId: userId,
      startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    select: { adId: true }
  });
  const excludeIds = recentViews.map((v) => v.adId);

  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      spendCoins: { lt: 999999999 }
    },
    select: { adId: true, budgetCoins: true, spendCoins: true }
  });
  const activeAdIds = activeCampaigns
    .filter((c) => c.spendCoins < c.budgetCoins)
    .map((c) => c.adId);

  if (activeAdIds.length === 0) {
    return res.json({ ad: null });
  }

  const candidates = await prisma.ad.findMany({
    where: {
      status: "APPROVED",
      AND: [
        excludeIds.length ? { id: { notIn: excludeIds } } : {},
        activeAdIds.length ? { id: { in: activeAdIds } } : {}
      ]
    },
    take: 10
  });

  if (candidates.length === 0) {
    return res.json({ ad: null });
  }
  const ad = candidates[Math.floor(Math.random() * candidates.length)];
  return res.json({ ad: { ...ad, mediaUrl: publicMediaUrl(ad.mediaKey) } });
});

router.post("/:id/view/start", authRequired, async (req, res) => {
  const userId = req.user!.sub;
  const adId = String(req.params.id);

  const view = await prisma.adView.create({
    data: {
      adId,
      viewerId: userId,
      clientFingerprint: headerString(req.headers["x-client-fingerprint"]),
      ipAddress: req.ip,
      userAgent: headerString(req.headers["user-agent"])
    }
  });

  return res.json({ viewId: view.id, startedAt: view.startedAt });
});

const CompleteSchema = z.object({
  viewId: z.string(),
  watchedSeconds: z.number().int().nonnegative().optional(),
  clientCompleted: z.boolean().optional()
});

router.post("/:id/view/complete", authRequired, async (req, res) => {
  const userId = req.user!.sub;
  const adId = String(req.params.id);
  const parse = CompleteSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  if (parse.data.clientCompleted !== true) {
    return res.status(400).json({ error: "client_not_completed" });
  }

  const view = await prisma.adView.findFirst({
    where: { id: parse.data.viewId, adId, viewerId: userId }
  });
  if (!view) {
    return res.status(404).json({ error: "view_not_found" });
  }
  if (view.valid) {
    return res.status(400).json({ error: "already_completed" });
  }

  const elapsedSeconds = (Date.now() - view.startedAt.getTime()) / 1000;
  if (elapsedSeconds < config.minWatchSeconds) {
    return res.status(400).json({ error: "watch_time_too_short" });
  }

  const ad = await prisma.ad.findUnique({ where: { id: adId } });
  if (!ad) {
    return res.status(404).json({ error: "ad_not_found" });
  }
  if (ad.type === "video" && ad.mediaDurationSeconds) {
    const watchedSeconds = parse.data.watchedSeconds ?? 0;
    if (watchedSeconds < ad.mediaDurationSeconds || elapsedSeconds < ad.mediaDurationSeconds) {
      return res.status(400).json({ error: "video_not_fully_watched" });
    }
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const daily = await prisma.dailyEarning.findUnique({
    where: { userId_date: { userId, date: dayKey } }
  });
  const totalToday = daily?.coins ?? 0;
  if (totalToday + config.coinsPerWatch > config.maxDailyCoins) {
    return res.status(400).json({ error: "daily_cap_reached" });
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      adId,
      status: "ACTIVE"
    }
  });
  if (!campaign || campaign.spendCoins >= campaign.budgetCoins) {
    return res.status(400).json({ error: "campaign_inactive" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.adView.update({
      where: { id: view.id },
      data: {
        completedAt: new Date(),
        valid: true,
        clientWatchedSeconds: parse.data.watchedSeconds,
        clientCompleted: parse.data.clientCompleted ?? false
      }
    });
    await tx.ledgerEntry.create({
      data: {
        userId,
        delta: config.coinsPerWatch,
        reason: "WATCH_REWARD",
        refType: "ad",
        refId: adId
      }
    });
    await tx.wallet.update({
      where: { userId },
      data: { balance: { increment: config.coinsPerWatch } }
    });
    const updated = await tx.campaign.update({
      where: { id: campaign.id },
      data: { spendCoins: { increment: config.coinsPerWatch } }
    });
    if (updated.spendCoins >= updated.budgetCoins && updated.status !== "COMPLETED") {
      await tx.campaign.update({
        where: { id: updated.id },
        data: { status: "COMPLETED" }
      });
    }
    if (daily) {
      await tx.dailyEarning.update({
        where: { userId_date: { userId, date: dayKey } },
        data: { coins: { increment: config.coinsPerWatch } }
      });
    } else {
      await tx.dailyEarning.create({
        data: { userId, date: dayKey, coins: config.coinsPerWatch }
      });
    }
  });

  const ip = view.ipAddress ?? req.ip ?? "";
  const fingerprint = view.clientFingerprint ?? "";
  if (ip) {
    const distinctUsers = await prisma.adView.findMany({
      where: {
        ipAddress: ip,
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      distinct: ["viewerId"],
      select: { viewerId: true }
    });
    if (distinctUsers.length >= config.fraudIpDailyLimit) {
      await prisma.fraudFlag.create({
        data: { userId, reason: "ip_shared_multiple_users", severity: 2 }
      });
    }
  }
  if (fingerprint) {
    const distinctUsers = await prisma.adView.findMany({
      where: {
        clientFingerprint: fingerprint,
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      distinct: ["viewerId"],
      select: { viewerId: true }
    });
    if (distinctUsers.length >= config.fraudFingerprintDailyLimit) {
      await prisma.fraudFlag.create({
        data: { userId, reason: "fingerprint_shared_multiple_users", severity: 2 }
      });
    }
  }

  return res.json({ ok: true, reward: config.coinsPerWatch });
});

const UploadSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number()
});

router.post("/upload", authRequired, async (req, res) => {
  const parse = UploadSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  if (!config.s3BucketName) {
    return res.status(501).json({ error: "s3_not_configured" });
  }

  const key = `uploads/${Date.now()}-${parse.data.filename}`;
  const uploadUrl = await signUpload(key, parse.data.contentType, parse.data.sizeBytes);
  const publicUrl = publicMediaUrl(key);

  return res.json({ key, uploadUrl, method: "PUT", publicUrl });
});

const CreateAdSchema = z.object({
  type: z.enum(["video", "banner"]),
  title: z.string().min(1),
  mediaKey: z.string().min(3),
  mediaDurationSeconds: z.number().int().positive().optional()
});

router.post("/", authRequired, async (req, res) => {
  const userId = req.user!.sub;
  const parse = CreateAdSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  const ad = await prisma.ad.create({
    data: {
      ownerId: userId,
      type: parse.data.type,
      title: parse.data.title,
      mediaKey: parse.data.mediaKey,
      mediaDurationSeconds: parse.data.mediaDurationSeconds,
      moderation: { create: {} }
    }
  });

  if (parse.data.type === "video" && !parse.data.mediaDurationSeconds) {
    await prisma.mediaIngestJob.upsert({
      where: { adId: ad.id },
      update: { status: "PENDING", lastError: null },
      create: { adId: ad.id }
    });
  }

  return res.json({ ad });
});

router.post("/:id/ingest-duration", authRequired, async (req, res) => {
  const userId = req.user!.sub;
  const adId = String(req.params.id);
  const ad = await prisma.ad.findUnique({ where: { id: adId } });
  if (!ad) {
    return res.status(404).json({ error: "ad_not_found" });
  }
  if (ad.ownerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (ad.type !== "video") {
    return res.status(400).json({ error: "not_a_video" });
  }
  const mediaUrl = publicMediaUrl(ad.mediaKey);
  const duration = await probeDurationSeconds(mediaUrl);
  if (!duration) {
    return res.status(400).json({ error: "duration_probe_failed" });
  }
  const updated = await prisma.ad.update({
    where: { id: adId },
    data: { mediaDurationSeconds: duration }
  });
  return res.json({ ad: updated });
});

export default router;

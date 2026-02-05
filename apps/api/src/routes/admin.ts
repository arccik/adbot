import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../prisma";
import { publicMediaUrl } from "../utils/s3";
import { adminRequired } from "../middleware/admin";

const router = Router();

function hashKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function logAdminAction(params: {
  key: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const { key, action, targetType, targetId, metadata } = params;
  await prisma.adminAuditLog.create({
    data: {
      actorKeyHash: hashKey(key),
      action,
      targetType,
      targetId,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}

router.get("/moderation", adminRequired, async (_req, res) => {
  const items = await prisma.moderationQueue.findMany({
    where: { status: "PENDING" },
    include: { ad: true }
  });
  const enriched = items.map((item) => ({
    ...item,
    ad: { ...item.ad, mediaUrl: publicMediaUrl(item.ad.mediaKey) }
  }));
  return res.json({ items: enriched });
});

router.post("/moderation/:id/approve", adminRequired, async (req, res) => {
  const adId = String(req.params.id);
  const key = req.headers["x-admin-key"] as string;
  await prisma.$transaction(async (tx) => {
    await tx.moderationQueue.update({
      where: { adId },
      data: { status: "APPROVED" }
    });
    await tx.ad.update({
      where: { id: adId },
      data: { status: "APPROVED" }
    });
  });
  await logAdminAction({
    key,
    action: "moderation_approve",
    targetType: "ad",
    targetId: adId
  });
  return res.json({ ok: true });
});

const RejectSchema = z.object({ notes: z.string().optional() });

router.post("/moderation/:id/reject", adminRequired, async (req, res) => {
  const adId = String(req.params.id);
  const key = req.headers["x-admin-key"] as string;
  const parse = RejectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  await prisma.$transaction(async (tx) => {
    await tx.moderationQueue.update({
      where: { adId },
      data: { status: "REJECTED", notes: parse.data.notes }
    });
    await tx.ad.update({
      where: { id: adId },
      data: { status: "REJECTED" }
    });
  });
  await logAdminAction({
    key,
    action: "moderation_reject",
    targetType: "ad",
    targetId: adId,
    metadata: { notes: parse.data.notes ?? "" }
  });
  return res.json({ ok: true });
});

const AdjustSchema = z.object({ delta: z.number().int() });

router.post("/users/:id/adjust-coins", adminRequired, async (req, res) => {
  const userId = String(req.params.id);
  const key = req.headers["x-admin-key"] as string;
  const parse = AdjustSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId },
      data: { balance: { increment: parse.data.delta } }
    });
    await tx.ledgerEntry.create({
      data: {
        userId,
        delta: parse.data.delta,
        reason: "ADMIN_ADJUST",
        refType: "admin",
        refId: "manual"
      }
    });
  });
  await logAdminAction({
    key,
    action: "adjust_coins",
    targetType: "user",
    targetId: userId,
    metadata: { delta: parse.data.delta }
  });

  return res.json({ ok: true });
});

router.get("/fraud", adminRequired, async (_req, res) => {
  const flags = await prisma.fraudFlag.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return res.json({ flags });
});

router.get("/ledger/adjustments", adminRequired, async (_req, res) => {
  const entries = await prisma.ledgerEntry.findMany({
    where: { reason: "ADMIN_ADJUST" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: true }
  });
  return res.json({ entries });
});

router.get("/campaigns", adminRequired, async (_req, res) => {
  const status = (_req.query.status as string | undefined)?.toUpperCase();
  const query = (_req.query.query as string | undefined)?.trim();
  const where: any = {};
  if (status && ["ACTIVE", "PAUSED", "COMPLETED"].includes(status)) {
    where.status = status;
  }
  if (query) {
    where.OR = [
      { id: { contains: query, mode: "insensitive" } },
      { ad: { title: { contains: query, mode: "insensitive" } } },
      { owner: { telegramId: { contains: query, mode: "insensitive" } } }
    ];
  }
  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { ad: true, owner: true }
  });
  return res.json({ campaigns });
});

router.post("/campaigns/:id/pause", adminRequired, async (req, res) => {
  const id = String(req.params.id);
  const key = req.headers["x-admin-key"] as string;
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED" }
  });
  await logAdminAction({
    key,
    action: "campaign_pause",
    targetType: "campaign",
    targetId: id
  });
  return res.json({ campaign });
});

router.post("/campaigns/:id/resume", adminRequired, async (req, res) => {
  const id = String(req.params.id);
  const key = req.headers["x-admin-key"] as string;
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "campaign_not_found" });
  }
  if (existing.spendCoins >= existing.budgetCoins) {
    return res.status(400).json({ error: "campaign_budget_exhausted" });
  }
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "ACTIVE" }
  });
  await logAdminAction({
    key,
    action: "campaign_resume",
    targetType: "campaign",
    targetId: id
  });
  return res.json({ campaign });
});

export default router;

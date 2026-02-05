import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { config } from "../config";
import { authRequired } from "../middleware/auth";

const router = Router();

router.get("/", authRequired, async (req, res) => {
  const userId = req.user!.sub;
  const campaigns = await prisma.campaign.findMany({
    where: { ownerId: userId },
    include: { ad: true }
  });
  return res.json({ campaigns });
});

const CreateCampaignSchema = z.object({
  adId: z.string(),
  budgetCoins: z.number().int().positive().optional()
});

router.post("/", authRequired, async (req, res) => {
  const userId = req.user!.sub;
  const parse = CreateCampaignSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  const budgetCoins = parse.data.budgetCoins ?? config.coinsPerCampaign;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < budgetCoins) {
    return res.status(400).json({ error: "insufficient_balance" });
  }

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        ownerId: userId,
        adId: parse.data.adId,
        budgetCoins
      }
    });
    await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: budgetCoins } }
    });
    await tx.ledgerEntry.create({
      data: {
        userId,
        delta: -budgetCoins,
        reason: "CAMPAIGN_SPEND",
        refType: "campaign",
        refId: created.id
      }
    });
    return created;
  });

  return res.json({ campaign });
});

export default router;

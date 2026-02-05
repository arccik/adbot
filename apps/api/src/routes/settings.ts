import { Router } from "express";
import { prisma } from "../prisma";
import { config } from "../config";

const router = Router();

router.get("/", async (_req, res) => {
  const settings = await prisma.setting.findMany();
  const stored = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return res.json({
    coinsPerWatch: Number(stored.coinsPerWatch ?? config.coinsPerWatch),
    coinsPerCampaign: Number(stored.coinsPerCampaign ?? config.coinsPerCampaign),
    minWatchSeconds: Number(stored.minWatchSeconds ?? config.minWatchSeconds),
    maxDailyCoins: Number(stored.maxDailyCoins ?? config.maxDailyCoins)
  });
});

export default router;

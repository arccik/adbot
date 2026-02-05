import { Router } from "express";
import { prisma } from "../prisma";
import { authRequired } from "../middleware/auth";

const router = Router();

router.get("/", authRequired, async (req, res) => {
  const userId = req.user!.sub;
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const ledger = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return res.json({ wallet, ledger });
});

export default router;

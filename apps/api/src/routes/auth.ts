import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../prisma";
import { verifyTelegramInitData } from "../utils/telegram";

const router = Router();

const AuthSchema = z.object({
  initData: z.string()
});

router.post("/telegram", async (req, res) => {
  const parse = AuthSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  if (!config.botToken) {
    return res.status(500).json({ error: "bot_token_not_configured" });
  }
  const { valid, data } = verifyTelegramInitData(parse.data.initData, config.botToken);
  if (!valid || !data.user) {
    return res.status(401).json({ error: "invalid_init_data" });
  }
  let tgUser: { id: number; username?: string };
  try {
    tgUser = JSON.parse(data.user);
  } catch {
    return res.status(400).json({ error: "invalid_user_json" });
  }
  const telegramId = String(tgUser.id);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { username: tgUser.username ?? undefined },
    create: {
      telegramId,
      username: tgUser.username ?? null,
      wallet: { create: {} }
    },
    include: { wallet: true }
  });

  const token = jwt.sign(
    { sub: user.id, telegramId: user.telegramId },
    config.jwtSecret,
    { expiresIn: config.jwtTtlSeconds }
  );

  return res.json({ token, user: { id: user.id, telegramId: user.telegramId, username: user.username } });
});

export default router;

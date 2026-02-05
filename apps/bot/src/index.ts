import dotenv from "dotenv";
import path from "path";
import { Telegraf, Markup } from "telegraf";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const webAppUrl = process.env.WEB_APP_URL ?? "";

if (!botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const bot = new Telegraf(botToken);

bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id);
  const username = ctx.from.username ?? null;

  await prisma.user.upsert({
    where: { telegramId },
    update: { username },
    create: {
      telegramId,
      username,
      wallet: { create: {} }
    }
  });

  const buttons = webAppUrl && webAppUrl.startsWith("https://")
    ? Markup.inlineKeyboard([
        Markup.button.webApp("Open AdBot", webAppUrl)
      ])
    : undefined;

  return ctx.reply(
    webAppUrl && !webAppUrl.startsWith("https://")
      ? "Welcome to AdBot. Web App URL must be HTTPS. Update WEB_APP_URL to an https link."
      : "Welcome to AdBot. Watch ads to earn coins, then spend them to post your own ads.",
    buttons
  );
});

bot.command("wallet", async (ctx) => {
  const telegramId = String(ctx.from.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { wallet: true }
  });

  const balance = user?.wallet?.balance ?? 0;
  const buttons = webAppUrl && webAppUrl.startsWith("https://")
    ? Markup.inlineKeyboard([
        Markup.button.webApp("Open Wallet", webAppUrl)
      ])
    : undefined;

  return ctx.reply(`Your balance: ${balance} coins`, buttons);
});

bot.command("help", (ctx) => {
  return ctx.reply(
    "Commands:\n/start - onboarding\n/wallet - view balance\n/help - this message"
  );
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

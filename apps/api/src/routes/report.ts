import { Router } from "express";
import { z } from "zod";
import { authRequired } from "../middleware/auth";

const router = Router();

const ReportSchema = z.object({
  adId: z.string(),
  reason: z.string().min(3)
});

router.post("/", authRequired, async (req, res) => {
  const parse = ReportSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  return res.json({ ok: true });
});

export default router;

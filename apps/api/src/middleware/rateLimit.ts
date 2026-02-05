import { Request, Response, NextFunction } from "express";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxPerMinute: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (existing.count >= maxPerMinute) {
      return res.status(429).json({ error: "rate_limited" });
    }
    existing.count += 1;
    return next();
  };
}

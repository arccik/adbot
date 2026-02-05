import { spawn } from "child_process";
import { config } from "../config";

export async function probeDurationSeconds(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      url
    ];
    const proc = spawn(config.ffprobePath, args);
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const value = Number.parseFloat(output.trim());
      if (!Number.isFinite(value)) {
        resolve(null);
        return;
      }
      resolve(Math.floor(value));
    });
  });
}

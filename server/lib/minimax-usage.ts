import fs from "fs";
import path from "path";
import { uploadsDir } from "./uploads-dir.ts";

type MinimaxUsageState = {
  totalChars: number;
  totalRequests: number;
  estimatedSpendUsd: number;
  updatedAt: string;
};

const usageFile = path.join(uploadsDir, "minimax_usage.json");

function readState(): MinimaxUsageState {
  try {
    if (!fs.existsSync(usageFile)) {
      return {
        totalChars: 0,
        totalRequests: 0,
        estimatedSpendUsd: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    const raw = fs.readFileSync(usageFile, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      totalChars: Number(parsed?.totalChars || 0),
      totalRequests: Number(parsed?.totalRequests || 0),
      estimatedSpendUsd: Number(parsed?.estimatedSpendUsd || 0),
      updatedAt: parsed?.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      totalChars: 0,
      totalRequests: 0,
      estimatedSpendUsd: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeState(state: MinimaxUsageState) {
  fs.writeFileSync(usageFile, JSON.stringify(state, null, 2), "utf-8");
}

export function recordMinimaxTtsUsage(text: string) {
  const per1k = Number(process.env.MINIMAX_TTS_PRICE_PER_1K_CHARS || "0");
  const chars = (text || "").length;
  const cost = per1k > 0 ? (chars / 1000) * per1k : 0;

  const curr = readState();
  const next: MinimaxUsageState = {
    totalChars: curr.totalChars + chars,
    totalRequests: curr.totalRequests + 1,
    estimatedSpendUsd: Number((curr.estimatedSpendUsd + cost).toFixed(6)),
    updatedAt: new Date().toISOString(),
  };
  writeState(next);
  return next;
}

export function getMinimaxUsage() {
  return readState();
}


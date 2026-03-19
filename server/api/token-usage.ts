import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";
import { getMinimaxUsage } from "../lib/minimax-usage.ts";

const router = express.Router();

type ProviderStatus = "ok" | "warning" | "error" | "unsupported";

type ProviderUsage = {
  provider: string;
  status: ProviderStatus;
  remaining?: number | null;
  total?: number | null;
  unit?: string;
  message?: string;
  raw?: any;
  checkedAt: string;
};

function nowISO() {
  return new Date().toISOString();
}

function num(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function normalizeProvider(
  provider: string,
  status: ProviderStatus,
  data: Partial<ProviderUsage>
): ProviderUsage {
  return {
    provider,
    status,
    checkedAt: nowISO(),
    ...data,
  };
}

async function fetchDeepSeek(): Promise<ProviderUsage> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    return normalizeProvider("DeepSeek", "warning", {
      message: "Missing DEEPSEEK_API_KEY",
    });
  }

  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return normalizeProvider("DeepSeek", "error", {
        message: `HTTP ${res.status}`,
        raw: json,
      });
    }

    const infos = json?.balance_infos || json?.data?.balance_infos || [];
    const first = Array.isArray(infos) ? infos[0] : null;
    const totalBalance = num(first?.total_balance);
    const granted = num(first?.granted_balance) ?? 0;
    const toppedUp = num(first?.topped_up_balance) ?? 0;
    const remaining = totalBalance ?? granted + toppedUp;

    return normalizeProvider("DeepSeek", "ok", {
      remaining,
      total: totalBalance,
      unit: first?.currency || "USD",
      raw: json,
    });
  } catch (e) {
    return normalizeProvider("DeepSeek", "error", {
      message: e instanceof Error ? e.message : "request failed",
    });
  }
}

async function fetchXAI(): Promise<ProviderUsage> {
  const managementKey = process.env.XAI_MANAGEMENT_KEY?.trim();
  const teamId = process.env.XAI_TEAM_ID?.trim();

  if (!managementKey || !teamId) {
    return normalizeProvider("xAI", "warning", {
      message: "Missing XAI_MANAGEMENT_KEY or XAI_TEAM_ID",
    });
  }

  try {
    const baseUrl = `https://management-api.x.ai/v1/billing/teams/${teamId}/prepaid/balance`;
    const headers = {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
    };
    const allChanges: any[] = [];
    let pageToken: string | null = null;
    let page = 0;
    let firstPayload: any = null;

    while (page < 20) {
      const url = pageToken ? `${baseUrl}?page_token=${encodeURIComponent(pageToken)}` : baseUrl;
      const res = await fetch(url, { method: "GET", headers });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return normalizeProvider("xAI", "error", {
          message: `HTTP ${res.status}`,
          raw: json,
        });
      }

      if (!firstPayload) firstPayload = json;
      const pageChanges = Array.isArray(json?.changes) ? json.changes : [];
      allChanges.push(...pageChanges);

      const nextToken =
        (typeof json?.nextPageToken === "string" && json.nextPageToken) ||
        (typeof json?.next_page_token === "string" && json.next_page_token) ||
        (typeof json?.pageToken === "string" && json.pageToken) ||
        (typeof json?.cursor === "string" && json.cursor) ||
        (typeof json?.pagination?.nextCursor === "string" && json.pagination.nextCursor) ||
        null;
      if (!nextToken) break;
      pageToken = nextToken;
      page += 1;
    }

    const balanceJson: any = firstPayload || {};

    // Current month usage (closer to console "API spend" card).
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const end = now;
    let monthSpendUsd: number | null = null;
    let usageDebug: any = null;
    try {
      const usageRes = await fetch(
        `https://management-api.x.ai/v1/billing/teams/${teamId}/usage`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            analyticsRequest: {
              timeRange: {
                startTime: start.toISOString().replace("T", " ").replace("Z", ""),
                endTime: end.toISOString().replace("T", " ").replace("Z", ""),
                timezone: "Etc/GMT",
              },
              timeUnit: "TIME_UNIT_DAY",
              values: [{ name: "usd", aggregation: "AGGREGATION_SUM" }],
              groupBy: [],
              filters: [],
            },
          }),
        }
      );
      const usageJson: any = await usageRes.json().catch(() => ({}));
      usageDebug = {
        status: usageRes.status,
        hasTimeSeries: Array.isArray(usageJson?.timeSeries),
      };
      if (usageRes.ok && Array.isArray(usageJson?.timeSeries)) {
        const sum = usageJson.timeSeries.reduce((acc: number, ts: any) => {
          const points = Array.isArray(ts?.dataPoints) ? ts.dataPoints : [];
          const s = points.reduce((a: number, p: any) => {
            const v = Array.isArray(p?.values) ? num(p.values[0]) : null;
            return a + (v ?? 0);
          }, 0);
          return acc + s;
        }, 0);
        monthSpendUsd = Number.isFinite(sum) ? Number(sum.toFixed(4)) : null;
      }
    } catch {
      // keep monthSpendUsd null
    }

    // Fallback to invoice preview spend if usage endpoint gives no data.
    let previewSpendUsd: number | null = null;
    if (monthSpendUsd == null) {
      try {
        const previewRes = await fetch(
          `https://management-api.x.ai/v1/billing/teams/${teamId}/postpaid/invoice/preview`,
          { method: "GET", headers }
        );
        const previewJson: any = await previewRes.json().catch(() => ({}));
        if (previewRes.ok) {
          const cents =
            num(previewJson?.coreInvoice?.prepaidCreditsUsed?.val) ??
            num(previewJson?.coreInvoice?.amountAfterVat) ??
            null;
          previewSpendUsd = cents != null ? Number((Math.abs(cents) / 100).toFixed(4)) : null;
        }
        usageDebug = {
          ...(usageDebug || {}),
          previewStatus: previewRes.status,
          previewHasCoreInvoice: !!previewJson?.coreInvoice,
        };
      } catch {
        // ignore
      }
    }
    const cycleSpendUsd = monthSpendUsd ?? previewSpendUsd;

    const remaining =
      num(balanceJson?.balance?.available_balance) ??
      num(balanceJson?.balance?.remaining_balance) ??
      num(balanceJson?.data?.balance?.available_balance) ??
      num(balanceJson?.data?.balance?.remaining_balance) ??
      num(balanceJson?.data?.available_balance) ??
      num(balanceJson?.available_balance) ??
      num(balanceJson?.credits?.remaining) ??
      num(balanceJson?.prepaid?.remaining) ??
      num(balanceJson?.remaining);
    const total =
      num(balanceJson?.balance?.total_balance) ??
      num(balanceJson?.data?.balance?.total_balance) ??
      num(balanceJson?.data?.total_balance) ??
      num(balanceJson?.total_balance) ??
      num(balanceJson?.credits?.total) ??
      num(balanceJson?.prepaid?.total) ??
      num(balanceJson?.total);

    // xAI may return prepaid balance as transaction changes + total.val (net).
    // In observed payload, purchases are negative and spend is positive, so usable
    // balance is the absolute inverse of total.val.
    const totalVal = num(balanceJson?.total?.val);
    const totalValUsd = totalVal != null ? Math.abs(totalVal) / 100 : null;

    const netFromChangesCents =
      allChanges.length > 0
        ? allChanges.reduce((acc, c) => {
            if (c?.topupStatus && c.topupStatus !== "SUCCEEDED") return acc;
            return acc + (num(c?.amount?.val) ?? 0);
          }, 0)
        : null;
    const netFromChangesUsd =
      netFromChangesCents != null ? Math.abs(netFromChangesCents) / 100 : null;

    const inferredRemainingRaw =
      remaining ??
      netFromChangesUsd ??
      totalValUsd;
    const inferredRemaining =
      inferredRemainingRaw != null && cycleSpendUsd != null
        ? Math.max(0, Number((inferredRemainingRaw - cycleSpendUsd).toFixed(4)))
        : inferredRemainingRaw;
    const inferredTotal =
      total ??
      totalValUsd;

    return normalizeProvider("xAI", "ok", {
      remaining: inferredRemaining,
      total: inferredTotal,
      unit:
        balanceJson?.balance?.currency ||
        balanceJson?.data?.balance?.currency ||
        balanceJson?.data?.currency ||
        balanceJson?.currency ||
        "USD",
      message:
        inferredRemaining == null && inferredTotal == null
          ? "Balance fields not found in xAI response (check raw schema)"
          : remaining == null && netFromChangesUsd != null
          ? "Balance inferred from paginated xAI changes (converted from cents)"
          : remaining == null && totalValUsd != null
          ? "Balance inferred from xAI transaction total (converted from cents)"
          : cycleSpendUsd != null
          ? `Current cycle spend: $${cycleSpendUsd} (remaining adjusted by spend)`
          : undefined,
      raw: {
        ...balanceJson,
        changes_count_loaded: allChanges.length,
        current_cycle_spend_usd: cycleSpendUsd,
        usage_debug: usageDebug,
        remaining_before_cycle_adjust_usd: inferredRemainingRaw,
      },
    });
  } catch (e) {
    return normalizeProvider("xAI", "error", {
      message: e instanceof Error ? e.message : "request failed",
    });
  }
}

async function fetchVideoBgRemover(): Promise<ProviderUsage> {
  const key = process.env.VIDEO_BG_REMOVER_KEY?.trim();
  if (!key) {
    return normalizeProvider("VideoBGRemover", "warning", {
      message: "Missing VIDEO_BG_REMOVER_KEY",
    });
  }

  try {
    const res = await fetch("https://api.videobgremover.com/v1/credits", {
      method: "GET",
      headers: {
        "X-Api-Key": key,
        "Content-Type": "application/json",
      },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return normalizeProvider("VideoBGRemover", "error", {
        message: `HTTP ${res.status}`,
        raw: json,
      });
    }

    const remaining =
      num(json?.remaining_credits) ??
      num(json?.credits?.remaining_credits) ??
      num(json?.remaining);
    const total =
      num(json?.total_credits) ??
      num(json?.credits?.total_credits) ??
      num(json?.total);

    return normalizeProvider("VideoBGRemover", "ok", {
      remaining,
      total,
      unit: "credits",
      raw: json,
    });
  } catch (e) {
    return normalizeProvider("VideoBGRemover", "error", {
      message: e instanceof Error ? e.message : "request failed",
    });
  }
}

async function fetchMinimax(): Promise<ProviderUsage> {
  const key = process.env.MINIMAX_TOKEN?.trim();
  if (!key) {
    return normalizeProvider("MiniMax", "warning", {
      message: "Missing MINIMAX_TOKEN",
    });
  }

  const customBalanceUrl = process.env.MINIMAX_BALANCE_ENDPOINT?.trim();
  if (customBalanceUrl) {
    try {
      const res = await fetch(customBalanceUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      });
      const json: any = await res.json().catch(() => ({}));
      if (res.ok) {
        const remaining =
          num(json?.remaining) ??
          num(json?.balance) ??
          num(json?.data?.remaining) ??
          num(json?.data?.balance) ??
          num(json?.data?.available_balance);
        const total =
          num(json?.total) ??
          num(json?.quota) ??
          num(json?.data?.total) ??
          num(json?.data?.quota) ??
          num(json?.data?.total_balance);
        return normalizeProvider("MiniMax", "ok", {
          remaining,
          total,
          unit: json?.unit || json?.data?.unit || "credits",
          raw: json,
        });
      }
      return normalizeProvider("MiniMax", "error", {
        message: `Custom endpoint HTTP ${res.status}`,
        raw: json,
      });
    } catch (e) {
      return normalizeProvider("MiniMax", "error", {
        message: e instanceof Error ? e.message : "Custom endpoint request failed",
      });
    }
  }

  const candidates = [
    "https://api-bj.minimaxi.com/v1/query_balance",
    "https://api-bj.minimaxi.com/v1/get_balance",
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) continue;

      const remaining =
        num(json?.remaining) ??
        num(json?.balance) ??
        num(json?.data?.remaining) ??
        num(json?.data?.balance);
      const total =
        num(json?.total) ??
        num(json?.quota) ??
        num(json?.data?.total) ??
        num(json?.data?.quota);

      return normalizeProvider("MiniMax", "ok", {
        remaining,
        total,
        unit: json?.unit || json?.data?.unit || "credits",
        raw: json,
      });
    } catch {
      // try next candidate
    }
  }

  return normalizeProvider("MiniMax", "unsupported", {
    message:
      "No documented public balance endpoint detected. Using local estimated spend model if configured.",
  });
}

function withMinimaxEstimatedFallback(provider: ProviderUsage): ProviderUsage {
  const initial =
    Number(process.env.MINIMAX_INITIAL_BALANCE_CNY || "0") ||
    Number(process.env.MINIMAX_INITIAL_BALANCE_USD || "0");
  const per1k = Number(process.env.MINIMAX_TTS_PRICE_PER_1K_CHARS || "0");
  const currency =
    (process.env.MINIMAX_CURRENCY || "").trim().toUpperCase() ||
    (process.env.MINIMAX_INITIAL_BALANCE_CNY ? "CNY" : "CNY");
  const usage = getMinimaxUsage();

  if (initial <= 0 || per1k <= 0) {
    return provider;
  }

  const remaining = Math.max(0, Number((initial - usage.estimatedSpendUsd).toFixed(6)));
  return {
    ...provider,
    status: "ok",
    remaining,
    total: Number(initial.toFixed(6)),
    unit: currency,
    message: `Estimated by local usage (chars=${usage.totalChars}, req=${usage.totalRequests}, price=${per1k} ${currency} per 1k chars)`,
    raw: {
      ...(provider.raw || {}),
      pricing_mode: "local_estimation",
      minimax_usage: usage,
    },
  };
}

router.get("/token-usage", async (_req, res) => {
  const [deepseek, minimax, xai, video] = await Promise.all([
    fetchDeepSeek(),
    fetchMinimax(),
    fetchXAI(),
    fetchVideoBgRemover(),
  ]);
  const providers = [deepseek, withMinimaxEstimatedFallback(minimax), xai, video];

  const connected = providers.filter((p) => p.status === "ok").length;
  return res.json({
    providers,
    summary: {
      connected,
      total: providers.length,
      checkedAt: nowISO(),
    },
  });
});

export default router;

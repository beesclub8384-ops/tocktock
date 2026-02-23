import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

async function testRedisReadWrite() {
  const testKey = "foreign:__test__";
  const testVal = [{ date: "2026-01-01", quantity: 100, ratio: 5.5 }];
  await redis.set(testKey, testVal, { ex: 60 });
  const read = await redis.get(testKey);
  await redis.del(testKey);
  return {
    write: "ok",
    readBack: read,
    isArray: Array.isArray(read),
  };
}

async function testKRXFetch() {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT03501",
    isuCd: "KR7005930003", // 삼성전자
    strtDd: "20260220",
    endDd: "20260223",
  });

  const res = await fetch(
    "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer:
          "https://data.krx.co.kr/contents/MDC/MDI/mdiStat/tables/MDCSTAT03501.html",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Origin: "https://data.krx.co.kr",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
    }
  );

  const status = res.status;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }

  return {
    status,
    bodyLength: text.length,
    bodySample: text.slice(0, 500),
    parsedKeys: json ? Object.keys(json) : null,
    rowCount: json?.OutBlock_1?.length ?? json?.output?.length ?? 0,
    firstRow: (json?.OutBlock_1?.[0] || json?.output?.[0]) ?? null,
  };
}

async function checkExistingKeys() {
  // Check a few known tickers
  const tickers = ["005930", "000660", "373220"];
  const results: Record<string, unknown> = {};
  for (const t of tickers) {
    const key = `foreign:${t}`;
    const val = await redis.get(key);
    const ttl = await redis.ttl(key);
    results[key] = {
      exists: val !== null,
      type: typeof val,
      isArray: Array.isArray(val),
      length: Array.isArray(val) ? val.length : null,
      ttl,
    };
  }
  return results;
}

export async function GET() {
  const report: Record<string, unknown> = {};

  // 1) Redis read/write test
  try {
    report.redis = await testRedisReadWrite();
  } catch (err) {
    report.redis = { error: String(err) };
  }

  // 2) Check existing keys
  try {
    report.existingKeys = await checkExistingKeys();
  } catch (err) {
    report.existingKeys = { error: String(err) };
  }

  // 3) KRX API test
  try {
    report.krx = await testKRXFetch();
  } catch (err) {
    report.krx = { error: String(err) };
  }

  // 4) If KRX succeeded, try storing one stock in Redis
  if (
    report.krx &&
    typeof report.krx === "object" &&
    "firstRow" in report.krx &&
    (report.krx as Record<string, unknown>).firstRow
  ) {
    try {
      const krxResult = report.krx as Record<string, unknown>;
      const row = krxResult.firstRow as Record<string, string>;
      const entry = {
        date: row.TRD_DD?.replace(/\//g, "-") || "unknown",
        quantity: Number(String(row.FORN_HLD_QTY || "0").replace(/,/g, "")) || 0,
        ratio: parseFloat(String(row.FORN_SHR_RT || "0").replace(/,/g, "")) || 0,
      };
      const key = "foreign:005930";
      // Don't overwrite real data — use a test prefix
      const testKey = "foreign:__diag_005930__";
      await redis.set(testKey, [entry], { ex: 120 });
      const readBack = await redis.get(testKey);
      await redis.del(testKey);
      report.e2eTest = {
        stored: entry,
        readBack,
        match: JSON.stringify([entry]) === JSON.stringify(readBack),
      };
    } catch (err) {
      report.e2eTest = { error: String(err) };
    }
  }

  return NextResponse.json(report);
}

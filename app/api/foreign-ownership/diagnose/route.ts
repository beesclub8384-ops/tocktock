import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const KRX_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "http://data.krx.co.kr/contents/MDC/MDI/mdiStat/tables/MDCSTAT03501.html",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Origin: "http://data.krx.co.kr",
  "X-Requested-With": "XMLHttpRequest",
};

async function testRedisReadWrite() {
  const testKey = "foreign:__test__";
  const testVal = [{ date: "2026-01-01", quantity: 100, ratio: 5.5 }];
  await redis.set(testKey, testVal, { ex: 60 });
  const read = await redis.get(testKey);
  await redis.del(testKey);
  return { write: "ok", readBack: read, isArray: Array.isArray(read) };
}

// Approach 1: HTTPS JSON endpoint
async function testKRX_HTTPS() {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT03501",
    isuCd: "KR7005930003",
    strtDd: "20260220",
    endDd: "20260223",
  });
  const res = await fetch(
    "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
    { method: "POST", headers: KRX_HEADERS, body: body.toString() }
  );
  return parseKRXResponse(res, "https-json");
}

// Approach 2: HTTP JSON endpoint
async function testKRX_HTTP() {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT03501",
    isuCd: "KR7005930003",
    strtDd: "20260220",
    endDd: "20260223",
  });
  const res = await fetch(
    "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
    { method: "POST", headers: KRX_HEADERS, body: body.toString() }
  );
  return parseKRXResponse(res, "http-json");
}

// Approach 3: OTP-based CSV download
async function testKRX_OTP() {
  // Step 1: Generate OTP
  const otpParams = new URLSearchParams({
    locale: "ko_KR",
    mktId: "STK",
    isuCd: "KR7005930003",
    strtDd: "20260220",
    endDd: "20260223",
    share: "2",
    money: "1",
    csvxls_is498No: "MDCSTAT03501",
    name: "fileDown",
    url: "dbms/MDC/STAT/standard/MDCSTAT03501",
  });
  const otpRes = await fetch(
    "http://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd",
    { method: "POST", headers: KRX_HEADERS, body: otpParams.toString() }
  );
  const otp = await otpRes.text();

  // Step 2: Download CSV using OTP
  const dlParams = new URLSearchParams({ code: otp });
  const dlRes = await fetch(
    "http://data.krx.co.kr/comm/fileDn/download_csv/download.cmd",
    { method: "POST", headers: KRX_HEADERS, body: dlParams.toString() }
  );
  const csvText = await dlRes.text();

  return {
    approach: "otp-csv",
    otpStatus: otpRes.status,
    otpLength: otp.length,
    otpSample: otp.slice(0, 100),
    dlStatus: dlRes.status,
    csvLength: csvText.length,
    csvSample: csvText.slice(0, 500),
  };
}

// Approach 4: NAVER Finance foreign ownership
async function testNaver() {
  const url =
    "https://api.finance.naver.com/siseJson.naver?symbol=005930&requestType=1&startTime=20260220&endTime=20260223&timeframe=day";
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  const text = await res.text();
  return {
    approach: "naver-sise",
    status: res.status,
    bodyLength: text.length,
    bodySample: text.slice(0, 300),
  };
}

async function parseKRXResponse(
  res: Response,
  approach: string
) {
  const status = res.status;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }
  return {
    approach,
    status,
    bodyLength: text.length,
    bodySample: text.slice(0, 300),
    parsedKeys: json ? Object.keys(json) : null,
    rowCount: json?.OutBlock_1?.length ?? json?.output?.length ?? 0,
    firstRow: json?.OutBlock_1?.[0] || json?.output?.[0] || null,
  };
}

export async function GET() {
  const report: Record<string, unknown> = {};

  // Redis test
  try {
    report.redis = await testRedisReadWrite();
  } catch (err) {
    report.redis = { error: String(err) };
  }

  // Test all KRX approaches in parallel
  const [httpsResult, httpResult, otpResult, naverResult] =
    await Promise.allSettled([
      testKRX_HTTPS(),
      testKRX_HTTP(),
      testKRX_OTP(),
      testNaver(),
    ]);

  report.krx_https =
    httpsResult.status === "fulfilled"
      ? httpsResult.value
      : { error: String(httpsResult.reason) };
  report.krx_http =
    httpResult.status === "fulfilled"
      ? httpResult.value
      : { error: String(httpResult.reason) };
  report.krx_otp =
    otpResult.status === "fulfilled"
      ? otpResult.value
      : { error: String(otpResult.reason) };
  report.naver =
    naverResult.status === "fulfilled"
      ? naverResult.value
      : { error: String(naverResult.reason) };

  return NextResponse.json(report);
}

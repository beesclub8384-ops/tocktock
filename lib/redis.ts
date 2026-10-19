import { Redis } from "@upstash/redis";

const base = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/*
 * 로컬/운영 Redis 분리 (2026-10-19 관측소 미션 7, docs/observatory-decision-log.md 19-4)
 *
 * 로컬·프리뷰도 운영과 같은 Upstash DB 를 쓴다(새 DB·키 발급은 사람 결정이라 하지 않았다).
 * 미션 6에서 로컬 cron 이 운영 키를 덮어써 운영 화면의 출처 표기가 틀어진 일이 있어서,
 * 운영(VERCEL_ENV=production)이 아닌 곳에서는 아래처럼 동작한다.
 *  - 쓰기(set·del·lpush 등): 키 앞에 LOCAL_KEY_PREFIX 를 붙인 "덮개 키"에만 쓴다. 운영 키는 바뀌지 않는다.
 *    덮개 키는 LOCAL_KEY_TTL_SECONDS 뒤 저절로 사라진다(같은 DB 용량을 오래 차지하지 않게).
 *  - 읽기(get·mget·lrange 등): 덮개 키가 있으면 그 값을, 없으면 운영 키를 읽는다.
 *    그래서 로컬 화면은 운영 데이터를 그대로 보여 주고, 로컬 cron 은 이어 받기도 그대로 된다.
 *  - del 은 덮개 키에 "지움 표시"를 남긴다(읽으면 null). 운영 키는 그대로.
 *  - 그 밖의 명령(multi·pipeline·eval 등)과 명령을 품은 객체 속성(json·functions·search·client)은 로컬에서
 *    쓰면 에러를 던진다(조용히 운영 키를 바꾸지 않게).
 *  - 리스트·세트·해시 쓰기는 운영 값을 복사하지 않고 빈 덮개 키에서 시작한다. 그래서 로컬에서 그런 키에 쓴 뒤에는
 *    로컬 값이 운영 값과 달라진다(관측소는 문자열 키 get·set 만 쓴다).
 *  - ⚠ 로컬 env 파일에 VERCEL_ENV=production 이 들어오면(vercel env pull 등) 로컬도 운영 키에 쓴다.
 * 운영에서는 원래 클라이언트를 그대로 쓰고 키 이름도 그대로다.
 */
export const IS_PRODUCTION_REDIS = process.env.VERCEL_ENV === "production";
export const LOCAL_KEY_PREFIX = "local:";
const LOCAL_KEY_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOMBSTONE = "__local_deleted__";

const READ_ONE = new Set(["lrange", "sismember", "scard", "smembers", "zrange", "hget", "hgetall", "exists", "type", "ttl"]);
const WRITE_ONE = new Set(["lpush", "rpush", "ltrim", "sadd", "srem", "zadd", "zrem", "hset", "hdel", "incr", "incrby", "expire"]);

function localRedis(): Redis {
  const P = (k: string) => LOCAL_KEY_PREFIX + k;
  // 덮개 키가 실제로 있는지 (지움 표시는 "있음 + null" 로 다룬다). 리스트·세트 등은 get 을 부르면
  // WRONGTYPE 에러라 종류부터 본다 (미션 7 독립 검증 지적 4)
  const overlay = async (key: string): Promise<"value" | "deleted" | "none"> => {
    const t = await base.type(P(key));
    if (t === "none") return "none";
    if (t !== "string") return "value";
    return (await base.get(P(key))) === TOMBSTONE ? "deleted" : "value";
  };
  const methods: Record<string, unknown> = {
    async get(key: string) {
      const v = await base.get(P(key));
      if (v === TOMBSTONE) return null;
      return v !== null ? v : base.get(key);
    },
    async mget(...keys: string[]) {
      const flat = keys.flat();
      const local = await base.mget<unknown[]>(...flat.map(P));
      const miss = flat.filter((_, i) => local[i] === null);
      const prod = miss.length > 0 ? await base.mget<unknown[]>(...miss) : [];
      let j = 0;
      return local.map((v) => (v === TOMBSTONE ? null : v !== null ? v : prod[j++]));
    },
    async set(key: string, value: unknown, opts?: Record<string, unknown>) {
      const hasExpiry = opts && ("ex" in opts || "px" in opts || "exat" in opts || "pxat" in opts);
      return base.set(P(key), value, (hasExpiry ? opts : { ...opts, ex: LOCAL_KEY_TTL_SECONDS }) as never);
    },
    async del(...keys: string[]) {
      const flat = keys.flat();
      await Promise.all(flat.map((k) => base.set(P(k), TOMBSTONE, { ex: LOCAL_KEY_TTL_SECONDS })));
      return flat.length;
    },
    keys: (pattern: string) => base.keys(pattern),
  };
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") return Reflect.get(target, prop, receiver);
      if (prop in methods) return methods[prop];
      if (READ_ONE.has(prop)) {
        return async (key: string, ...rest: unknown[]) => {
          const o = await overlay(key);
          const fn = (target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop].bind(target);
          if (o === "deleted") return fn(P(key) + ":__none__", ...rest);
          return fn(o === "value" ? P(key) : key, ...rest);
        };
      }
      if (WRITE_ONE.has(prop)) {
        return async (key: string, ...rest: unknown[]) => {
          const fn = (target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop].bind(target);
          const out = await fn(P(key), ...rest);
          if (prop !== "expire") await base.expire(P(key), LOCAL_KEY_TTL_SECONDS);
          return out;
        };
      }
      const v = Reflect.get(target, prop, receiver);
      // json·functions·search·client 처럼 명령을 품은 객체 속성도 막는다(그대로 주면 접두사 없이 운영 키에 쓴다 —
      // 미션 7 독립 검증 지적 3). 원시값(설정 플래그 등)과 없는 속성은 그대로 준다.
      if (v === undefined || v === null || (typeof v !== "function" && typeof v !== "object")) return v;
      return () => {
        throw new Error(`로컬(VERCEL_ENV≠production)에서는 운영 Redis 를 바꿀 수 있는 '${prop}' 명령을 막습니다 (lib/redis.ts)`);
      };
    },
  });
}

export const redis: Redis = IS_PRODUCTION_REDIS ? base : localRedis();

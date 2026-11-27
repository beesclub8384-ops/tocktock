import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 2026-11-27 "순환매 점검(/rotation)"을 "업종별 주가 흐름(/sector-flow)"으로 바꿨다. 예전 주소로 와도 열리게 한다.
  async redirects() {
    return [{ source: "/rotation", destination: "/sector-flow", permanent: true }];
  },
};

export default nextConfig;

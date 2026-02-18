import Link from "next/link";

export default function Home() {
  return (
    <div className="flyer-page">
      {/* 상단 띠배너 */}
      <div className="flyer-ticker">
        <div className="flyer-ticker-inner">
          ★ 투자정보 대방출 ★ 지금 바로 확인하세요 ★ 놓치면 후회합니다 ★ 한정
          기간 특별 공개 ★ 투자정보 대방출 ★ 지금 바로 확인하세요 ★ 놓치면
          후회합니다 ★ 한정 기간 특별 공개 ★
        </div>
      </div>

      {/* 히어로 섹션 */}
      <section className="flyer-hero">
        {/* 배경 장식 */}
        <div className="flyer-starburst flyer-starburst-1">★</div>
        <div className="flyer-starburst flyer-starburst-2">※</div>
        <div className="flyer-starburst flyer-starburst-3">★</div>
        <div className="flyer-starburst flyer-starburst-4">◆</div>
        <div className="flyer-starburst flyer-starburst-5">★</div>
        <div className="flyer-starburst flyer-starburst-6">※</div>

        {/* 회전 배지 */}
        <div className="flyer-badge-rotate flyer-badge-top-left">
          오픈
          <br />
          임박!!
        </div>
        <div className="flyer-badge-rotate flyer-badge-top-right">
          완전
          <br />
          무료!
        </div>

        <div className="flyer-hero-inner">
          {/* 폭탄 세일 배지 */}
          <div className="flyer-bomb-badge">
            <span className="flyer-bomb-text">★ 특가 ★</span>
          </div>

          <h1 className="flyer-title">
            <span className="flyer-title-sub">
              ※※※ 투자자 필독 ※※※
            </span>
            <span className="flyer-title-main">
              주식정보
              <span className="flyer-title-highlight"> 대.방" .출!!!</span>
            </span>
            <span className="flyer-title-bottom">
              ━━━ TockTock ━━━
            </span>
          </h1>

          <p className="flyer-subtitle">
            ▶▶▶ 실시간 주식 정보 공유 커뮤니티 ◀◀◀
          </p>

          <div className="flyer-price-tag">
            <span className="flyer-price-before">
              월 99,000원
            </span>
            <span className="flyer-price-arrow">→</span>
            <span className="flyer-price-now">완전 무료!!!</span>
          </div>

          <div className="flyer-cta-area">
            <Link href="/blog" className="flyer-cta-btn">
              ★ 지금 바로 입장하기 ★
            </Link>
            <p className="flyer-cta-sub">
              ※ 선착순 마감 ※ 서두르세요!!!
            </p>
          </div>
        </div>
      </section>

      {/* 특가 상품 섹션 */}
      <section className="flyer-section-features">
        <div className="flyer-section-header">
          <span className="flyer-section-deco">◆◇◆◇◆</span>
          <h2 className="flyer-section-title">
            ★ 이번 주 특가 혜택 ★
          </h2>
          <span className="flyer-section-deco">◆◇◆◇◆</span>
        </div>

        <div className="flyer-cards">
          {/* 카드 1 */}
          <div className="flyer-card flyer-card-1">
            <div className="flyer-card-badge">HOT</div>
            <div className="flyer-card-icon">📈</div>
            <h3 className="flyer-card-title">실시간 종목 토론</h3>
            <p className="flyer-card-desc">
              다른 투자자들과 실시간으로 의견을 나누고 분석을 공유!!!
            </p>
            <div className="flyer-card-price">
              <span className="flyer-card-price-old">50,000원</span>
              <span className="flyer-card-price-new">무료!!</span>
            </div>
          </div>

          {/* 카드 2 */}
          <div className="flyer-card flyer-card-2">
            <div className="flyer-card-badge flyer-card-badge-blue">
              대박
            </div>
            <div className="flyer-card-icon">💡</div>
            <h3 className="flyer-card-title">투자 인사이트</h3>
            <p className="flyer-card-desc">
              경험 많은 투자자들의 비밀 분석 자료 전격 공개!!!
            </p>
            <div className="flyer-card-price">
              <span className="flyer-card-price-old">100,000원</span>
              <span className="flyer-card-price-new">공짜!!</span>
            </div>
          </div>

          {/* 카드 3 */}
          <div className="flyer-card flyer-card-3">
            <div className="flyer-card-badge flyer-card-badge-green">
              1+1
            </div>
            <div className="flyer-card-icon">🤝</div>
            <h3 className="flyer-card-title">커뮤니티 네트워크</h3>
            <p className="flyer-card-desc">
              VIP 투자자 모임 초대권 증정!!! 지금 가입하면 바로!!!
            </p>
            <div className="flyer-card-price">
              <span className="flyer-card-price-old">200,000원</span>
              <span className="flyer-card-price-new">0원!!</span>
            </div>
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="flyer-bottom-cta">
        <div className="flyer-bottom-inner">
          <div className="flyer-bottom-stars">
            ★彡 ★彡 ★彡 ★彡 ★彡
          </div>
          <h2 className="flyer-bottom-title">
            지금 안 하면 평생 후회합니다!!!
          </h2>
          <p className="flyer-bottom-desc">
            ▼▼▼ 아래 버튼을 누르세요 ▼▼▼
          </p>
          <Link href="/blog" className="flyer-bottom-btn">
            ★★★ 블로그 입장하기 ★★★
          </Link>
          <div className="flyer-bottom-fine">
            ※ 본 서비스는 100% 무료입니다 ※<br />
            ※ 투자 판단은 본인의 책임입니다 ※
          </div>
        </div>
      </section>

      {/* 하단 띠배너 */}
      <div className="flyer-ticker flyer-ticker-bottom">
        <div className="flyer-ticker-inner flyer-ticker-reverse">
          ♣ 대한민국 No.1 투자 커뮤니티 ♣ 회원수 폭발 증가중 ♣ 지금이
          기회입니다 ♣ 완전 무료 개방 ♣ 대한민국 No.1 투자 커뮤니티 ♣ 회원수
          폭발 증가중 ♣ 지금이 기회입니다 ♣ 완전 무료 개방 ♣
        </div>
      </div>
    </div>
  );
}

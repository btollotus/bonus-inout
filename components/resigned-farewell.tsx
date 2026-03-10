'use client'

// 사용법: login/page.tsx에서 searchParams.resigned === '1' 일 때 이 컴포넌트를 렌더링
// 예시:
//   import ResignedFarewell from '@/components/resigned-farewell'
//   if (searchParams.resigned) return <ResignedFarewell />

import { useEffect, useState } from 'react'

export default function ResignedFarewell() {
  const [visible, setVisible] = useState(false)
  const [particlesVisible, setParticlesVisible] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100)
    const t2 = setTimeout(() => setParticlesVisible(true), 600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;600;700&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        .farewell-root {
          min-height: 100vh;
          background: #0a0a0f;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Noto Serif KR', serif;
          position: relative;
          overflow: hidden;
        }

        /* 배경 별빛 효과 */
        .stars {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: white;
          border-radius: 50%;
          opacity: 0;
          animation: twinkle var(--duration, 3s) ease-in-out infinite var(--delay, 0s);
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: var(--opacity, 0.6); transform: scale(1); }
        }

        /* 금빛 빛줄기 */
        .light-ray {
          position: fixed;
          top: -20%;
          left: 50%;
          transform: translateX(-50%);
          width: 1px;
          height: 120vh;
          background: linear-gradient(to bottom, transparent, rgba(212,175,55,0.15), transparent);
          pointer-events: none;
          z-index: 0;
        }
        .light-ray:nth-child(1) { transform: translateX(-50%) rotate(-15deg); }
        .light-ray:nth-child(2) { transform: translateX(-50%) rotate(0deg); opacity: 0.7; }
        .light-ray:nth-child(3) { transform: translateX(-50%) rotate(15deg); }

        /* 메인 카드 */
        .card {
          position: relative;
          z-index: 10;
          max-width: 680px;
          width: 90%;
          padding: 64px 60px;
          background: linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
          border: 1px solid rgba(212,175,55,0.25);
          border-radius: 2px;
          backdrop-filter: blur(20px);
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 1.2s cubic-bezier(0.22,1,0.36,1), transform 1.2s cubic-bezier(0.22,1,0.36,1);
          text-align: center;
        }
        .card.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* 상단 장식선 */
        .ornament-top {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 40px;
        }
        .ornament-line {
          height: 1px;
          width: 60px;
          background: linear-gradient(to right, transparent, rgba(212,175,55,0.6));
        }
        .ornament-line.right {
          background: linear-gradient(to left, transparent, rgba(212,175,55,0.6));
        }
        .ornament-diamond {
          width: 6px;
          height: 6px;
          background: #d4af37;
          transform: rotate(45deg);
          opacity: 0.8;
        }

        /* 로고 영역 */
        .logo-wrap {
          margin-bottom: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .logo-icon {
          width: 52px;
          height: 52px;
          border: 1.5px solid rgba(212,175,55,0.5);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .logo-icon::before {
          content: '';
          position: absolute;
          inset: 4px;
          border: 1px solid rgba(212,175,55,0.2);
          border-radius: 50%;
        }
        .logo-b {
          font-family: 'Cormorant Garamond', serif;
          font-size: 24px;
          font-weight: 400;
          color: #d4af37;
          letter-spacing: 0.05em;
          line-height: 1;
        }
        .logo-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 13px;
          letter-spacing: 0.25em;
          color: rgba(212,175,55,0.7);
          text-transform: uppercase;
        }

        /* 구분선 */
        .divider {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, transparent, rgba(212,175,55,0.4), transparent);
          margin: 0 auto 36px;
        }

        /* 감사 인사 */
        .farewell-label {
          font-family: 'Cormorant Garamond', serif;
          font-size: 12px;
          letter-spacing: 0.35em;
          color: rgba(212,175,55,0.6);
          text-transform: uppercase;
          margin-bottom: 20px;
        }

        .farewell-title {
          font-size: 26px;
          font-weight: 300;
          color: rgba(255,255,255,0.92);
          line-height: 1.7;
          letter-spacing: -0.01em;
          margin-bottom: 32px;
          word-break: keep-all;
        }
        .farewell-title strong {
          color: #d4af37;
          font-weight: 600;
        }

        .farewell-body {
          font-size: 15px;
          font-weight: 300;
          color: rgba(255,255,255,0.55);
          line-height: 2;
          letter-spacing: 0.02em;
          word-break: keep-all;
          margin-bottom: 40px;
        }

        /* 하단 장식 */
        .ornament-bottom {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 32px;
        }
        .ornament-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: rgba(212,175,55,0.5);
        }
        .ornament-dot.center {
          width: 5px;
          height: 5px;
          background: rgba(212,175,55,0.8);
        }

        /* 서명 */
        .signature {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 18px;
          color: rgba(212,175,55,0.6);
          letter-spacing: 0.05em;
        }

        /* 파티클 (금빛 먼지) */
        .particles {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 5;
          opacity: 0;
          transition: opacity 1s ease;
        }
        .particles.visible { opacity: 1; }
        .particle {
          position: absolute;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #d4af37;
          animation: float var(--dur, 8s) ease-in-out infinite var(--del, 0s);
        }
        @keyframes float {
          0% { transform: translateY(100vh) translateX(0) scale(0); opacity: 0; }
          10% { opacity: var(--op, 0.6); transform: translateY(80vh) translateX(var(--x1, 10px)) scale(1); }
          90% { opacity: var(--op, 0.4); transform: translateY(10vh) translateX(var(--x2, -10px)) scale(0.8); }
          100% { transform: translateY(0vh) translateX(0) scale(0); opacity: 0; }
        }

        /* 모바일 대응 */
        @media (max-width: 480px) {
          .card { padding: 48px 32px; }
          .farewell-title { font-size: 22px; }
        }
      `}</style>

      <div className="farewell-root">
        {/* 별빛 배경 */}
        <div className="stars">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="star"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                '--duration': `${2 + Math.random() * 4}s`,
                '--delay': `${Math.random() * 5}s`,
                '--opacity': `${0.3 + Math.random() * 0.5}`,
                width: Math.random() > 0.8 ? '3px' : '2px',
                height: Math.random() > 0.8 ? '3px' : '2px',
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* 빛줄기 */}
        <div className="light-ray" />
        <div className="light-ray" />
        <div className="light-ray" />

        {/* 금빛 파티클 */}
        <div className={`particles ${particlesVisible ? 'visible' : ''}`}>
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${5 + Math.random() * 90}%`,
                '--dur': `${7 + Math.random() * 8}s`,
                '--del': `${Math.random() * 6}s`,
                '--x1': `${(Math.random() - 0.5) * 60}px`,
                '--x2': `${(Math.random() - 0.5) * 80}px`,
                '--op': `${0.3 + Math.random() * 0.5}`,
                width: Math.random() > 0.6 ? '4px' : '2px',
                height: Math.random() > 0.6 ? '4px' : '2px',
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* 메인 카드 */}
        <div className={`card ${visible ? 'visible' : ''}`}>

          {/* 상단 장식 */}
          <div className="ornament-top">
            <div className="ornament-line" />
            <div className="ornament-diamond" />
            <div className="ornament-line right" />
          </div>

          {/* 로고 */}
          <div className="logo-wrap">
            <div className="logo-icon">
              <span className="logo-b">B</span>
            </div>
            <span className="logo-name">Bonusmate</span>
          </div>

          <div className="divider" />

          {/* 메시지 */}
          <p className="farewell-label">Farewell Message</p>

          <h1 className="farewell-title">
            <strong>(주)보누스메이트</strong>와 함께해 주셔서<br />
            진심으로 감사드립니다.
          </h1>

          <p className="farewell-body">
            함께한 모든 시간이 소중한 자산이 되길 바랍니다.<br />
            앞으로의 길에 늘 좋은 일이 가득하고,<br />
            행복과 건강이 함께하길 진심으로 기원합니다.
          </p>

          {/* 하단 장식 */}
          <div className="ornament-bottom">
            <div className="ornament-dot" />
            <div className="ornament-dot" />
            <div className="ornament-dot center" />
            <div className="ornament-dot" />
            <div className="ornament-dot" />
          </div>

          <p className="signature">— (주) 보누스메이트 임직원 일동</p>
        </div>
      </div>
    </>
  )
}

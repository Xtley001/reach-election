import { useNavigate } from 'react-router-dom';

const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
    <line x1="2"  y1="20" x2="22" y2="20"/>
  </svg>
);

const MapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/>
    <line x1="9"  y1="3"  x2="9"  y2="18"/>
    <line x1="15" y1="6"  x2="15" y2="21"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const features = [
  {
    icon: <ChartIcon />,
    label: 'Director',
    title: 'Campaign intelligence at a glance',
    body: 'See real-time turnout, PVC penetration, canvassing depth, and messaging reach across every zone — from one dashboard.',
  },
  {
    icon: <MapIcon />,
    label: 'Coordinator',
    title: 'Zone-level command and control',
    body: 'Build targeted messaging sessions, assign voter queues to agents, and track delivery across your zone's polling units.',
  },
  {
    icon: <UsersIcon />,
    label: 'Field Agent',
    title: 'Voter-by-voter canvassing tools',
    body: 'Search INEC-matched voter records, log support levels and PVC status, and send WhatsApp messages in one tap.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: '100dvh',
        background: '#0C0C0C',
        color: '#F0F0F2',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Dot-grid texture */}
        <div aria-hidden style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          pointerEvents: 'none',
        }} />

        {/* Radial glow — top right */}
        <div aria-hidden style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '60vw',
          height: '60vw',
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Nav */}
        <nav style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '22px clamp(24px, 6vw, 72px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '0.12em',
            color: '#F0F0F2',
            textTransform: 'uppercase',
          }}>
            REACH
          </span>
          <button
            onClick={() => navigate('/login')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(240,240,242,0.08)',
              border: '1px solid rgba(240,240,242,0.14)',
              borderRadius: 6,
              color: '#F0F0F2',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              fontSize: 13,
              padding: '8px 16px',
              cursor: 'pointer',
              letterSpacing: '-0.01em',
              backdropFilter: 'blur(8px)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,240,242,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(240,240,242,0.08)'}
          >
            Sign in <span aria-hidden style={{ fontSize: 15 }}>→</span>
          </button>
        </nav>

        {/* Hero body */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 'clamp(48px, 8vh, 96px) clamp(24px, 6vw, 72px)',
          position: 'relative',
          zIndex: 5,
        }}>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.16em',
            color: 'rgba(240,240,242,0.38)',
            textTransform: 'uppercase',
            marginBottom: 24,
          }}>
            Election field operations platform
          </p>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(44px, 7.5vw, 84px)',
            lineHeight: 1.04,
            letterSpacing: '-0.03em',
            color: '#F0F0F2',
            maxWidth: 820,
            marginBottom: 28,
          }}>
            The ground game platform
            <br />
            <span style={{ color: 'rgba(240,240,242,0.28)' }}>
              built for Nigerian campaigns.
            </span>
          </h1>

          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'clamp(15px, 1.8vw, 18px)',
            color: 'rgba(240,240,242,0.55)',
            maxWidth: 520,
            lineHeight: 1.7,
            marginBottom: 44,
          }}>
            Directors, coordinators, and field agents — all working from the same
            real-time picture. INEC voter data, zone management, and targeted
            outreach in one platform.
          </p>

          <div>
            <button
              onClick={() => navigate('/login')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#F0F0F2',
                border: 'none',
                borderRadius: 7,
                color: '#0C0C0C',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 15,
                padding: '14px 28px',
                cursor: 'pointer',
                letterSpacing: '-0.01em',
                transition: 'opacity 0.15s ease, transform 0.1s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              onMouseDown={e  => e.currentTarget.style.transform = 'scale(0.97)'}
              onMouseUp={e    => e.currentTarget.style.transform = 'scale(1)'}
            >
              Sign in to your campaign
            </button>
          </div>

          {/* Key numbers */}
          <div style={{
            display: 'flex',
            gap: 'clamp(24px, 4vw, 56px)',
            marginTop: 'clamp(48px, 8vh, 80px)',
            flexWrap: 'wrap',
          }}>
            {[
              { n: '174,000+', label: 'Polling units indexed' },
              { n: '3-tier',   label: 'Role hierarchy' },
              { n: 'Real-time', label: 'Turnout tracking' },
            ].map(({ n, label }) => (
              <div key={label}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 'clamp(20px, 2.5vw, 28px)',
                  color: '#F0F0F2',
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}>{n}</div>
                <div style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 11,
                  color: 'rgba(240,240,242,0.35)',
                  fontWeight: 500,
                  marginTop: 3,
                  letterSpacing: '0.03em',
                }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div aria-hidden style={{
          position: 'absolute',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(240,240,242,0.2)',
          }}>Scroll</span>
          <div style={{
            width: 1,
            height: 32,
            background: 'linear-gradient(to bottom, rgba(240,240,242,0.2), transparent)',
          }} />
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(64px, 10vw, 112px) clamp(24px, 6vw, 72px)',
        background: 'var(--bg)',
      }}>
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.16em',
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}>Built for every level of the campaign</p>

          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(26px, 3.5vw, 40px)',
            letterSpacing: '-0.025em',
            color: 'var(--text)',
            lineHeight: 1.18,
            marginBottom: 52,
            maxWidth: 500,
          }}>
            Every role has exactly what it needs. Nothing more.
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
          }}>
            {features.map((f, i) => (
              <div key={f.title} style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '28px 24px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}>
                {/* Icon */}
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text)',
                  marginBottom: 20,
                  flexShrink: 0,
                }}>{f.icon}</div>

                {/* Role pill */}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-2)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                  fontFamily: 'var(--font-sans)',
                  alignSelf: 'flex-start',
                }}>{f.label}</span>

                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 17,
                  letterSpacing: '-0.015em',
                  color: 'var(--text)',
                  lineHeight: 1.25,
                  marginBottom: 10,
                }}>{f.title}</h3>

                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--text-2)',
                  lineHeight: 1.65,
                }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(48px, 8vw, 96px) clamp(24px, 6vw, 72px)',
        background: 'var(--bg-2)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.16em',
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}>How access works</p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 0,
          }}>
            {[
              {
                n: '01',
                title: 'Director is seeded',
                body: 'The campaign's director account is provisioned by the system administrator with a single SQL command.',
              },
              {
                n: '02',
                title: 'Teams are invited',
                body: 'Directors generate secure invite links for coordinators and agents — no passwords, no self-registration.',
              },
              {
                n: '03',
                title: 'Login by OTP',
                body: 'All users sign in with a 6-digit one-time code sent to their email or phone. No credentials to lose.',
              },
              {
                n: '04',
                title: 'Deploy to the field',
                body: 'Coordinators activate sessions, agents start canvassing. The director dashboard updates in real time.',
              },
            ].map((step, i, arr) => (
              <div key={step.n} style={{
                padding: '28px 24px',
                borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'var(--text-3)',
                  marginBottom: 14,
                }}>{step.n}</div>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 16,
                  letterSpacing: '-0.01em',
                  color: 'var(--text)',
                  marginBottom: 8,
                }}>{step.title}</h3>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'var(--text-2)',
                  lineHeight: 1.6,
                }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(56px, 8vw, 96px) clamp(24px, 6vw, 72px)',
        background: 'var(--bg)',
      }}>
        <div style={{
          maxWidth: 1020,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 32,
          flexWrap: 'wrap',
        }}>
          <div style={{ maxWidth: 520 }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(22px, 3vw, 30px)',
              letterSpacing: '-0.02em',
              color: 'var(--text)',
              marginBottom: 8,
              lineHeight: 1.2,
            }}>
              Ready to run a tighter ground game?
            </h2>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--text-2)',
              lineHeight: 1.6,
            }}>
              If your director has set up the campaign, sign in with the email or
              phone number on your account.
            </p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="btn btn-primary btn-lg"
            style={{ flexShrink: 0, minWidth: 140 }}
          >
            Sign in
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '20px clamp(24px, 6vw, 72px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        background: 'var(--bg)',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.10em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
        }}>REACH</span>
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--text-3)',
        }}>
          © {new Date().getFullYear()} REACH Election Platform
        </span>
      </footer>

    </div>
  );
}

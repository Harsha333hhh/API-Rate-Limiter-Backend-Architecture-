import { Link } from 'react-router-dom'

function LogoMark() {
  return (
    <div className="w-9 h-9 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
        <path d="M7.5 16.5V8.25A2.25 2.25 0 0 1 9.75 6h4.5A2.25 2.25 0 0 1 16.5 8.25v4.5A2.25 2.25 0 0 1 14.25 15H11l-3.5 3.5v-2Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function FeatureCard({ title, description, children }) {
  return (
    <div className="card surface-card p-6 transition-transform duration-200 hover:-translate-y-1">
      <div className="w-11 h-11 rounded-2xl bg-primary-soft flex items-center justify-center text-primary mb-4">
        {children}
      </div>
      <h3 className="font-display text-2xl text-text mb-2">{title}</h3>
      <p className="text-sm leading-6 text-text-secondary">{description}</p>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 pointer-events-none opacity-70">
        <div className="absolute -top-24 left-8 w-72 h-72 rounded-full bg-primary-soft blur-3xl" />
        <div className="absolute top-24 right-0 w-80 h-80 rounded-full bg-meter/20 blur-3xl" />
      </div>

      <header className="relative z-10 px-6 py-5 md:px-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div className="font-display text-2xl tracking-tight">Whisper</div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="btn-ghost px-4 py-2 rounded-full bg-transparent">
            Log in
          </Link>
          <Link to="/signup" className="btn-primary px-4 py-2 rounded-full">
            Sign up
          </Link>
        </div>
      </header>

      <main className="relative z-10 px-6 pb-16 md:px-10">
        <section className="mx-auto max-w-6xl pt-12 md:pt-20 text-center">
          <p className="label mb-6 tracking-[0.28em]">Direct messages by ID</p>
          <h1 className="font-display text-[clamp(4.2rem,12vw,8.75rem)] leading-[0.88] text-text tracking-[-0.04em]">
            Whisper
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg md:text-2xl leading-relaxed text-text-secondary">
            Direct messages, by ID — no phone numbers, no friend requests, just conversations.
          </p>
        </section>

        <section className="mx-auto mt-16 md:mt-20 max-w-6xl">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FeatureCard
              title="Message anyone by ID"
              description="Skip phone numbers and usernames. Type a short ID and start a private conversation immediately."
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
                <path d="M8.25 6.75h11.5M4.25 12h15.5M8.25 17.25h11.5" strokeLinecap="round" />
                <path d="M5.25 6.75h.01M5.25 12h.01M5.25 17.25h.01" strokeLinecap="round" />
              </svg>
            </FeatureCard>
            <FeatureCard
              title="Smart rate limiting"
              description="Multi-tier protection blocks bots and flooding while staying invisible to normal chat use."
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3l8 4v6c0 5-3.2 8.7-8 8.7S4 18 4 13V7l8-4Z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9.5 12.5 11 14l3.5-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </FeatureCard>
            <FeatureCard
              title="Read receipts"
              description="See when messages have been viewed, plus unread dots and a live notification badge."
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
                <path d="M8 12h8M8 8h8M8 16h5" strokeLinecap="round" />
                <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8A2.5 2.5 0 0 1 17.5 17H11l-4.5 3v-3H6.5A2.5 2.5 0 0 1 4 14.5v-8Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </FeatureCard>
            <FeatureCard
              title="Theme customization"
              description="Switch light and dark mode, then pick an accent color that matches your taste."
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3v18" strokeLinecap="round" />
                <path d="M5 7h14M5 17h14" strokeLinecap="round" />
                <path d="M8.5 7a3.5 3.5 0 0 0 0 10 3.5 3.5 0 0 0 0-10Zm7 0a3.5 3.5 0 0 1 0 10 3.5 3.5 0 0 1 0-10Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </FeatureCard>
          </div>
        </section>
      </main>
    </div>
  )
}
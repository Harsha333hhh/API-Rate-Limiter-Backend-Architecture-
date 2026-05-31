import { useEffect } from 'react'

export default function About() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text px-4 md:px-10 pb-16">
      <div className="mx-auto max-w-5xl py-14">
        <header className="mb-10 text-center">
          <h1 className="font-display text-4xl md:text-5xl mb-3">About Whisper</h1>
          <p className="text-lg text-text-secondary">An API Rate Limiter, demonstrated through a messaging app.</p>
          <p className="mt-6 text-base leading-7 text-text-secondary max-w-3xl mx-auto">
            Hi, I'm <strong><code>Madupa Harshavardan</code></strong>, a final-year B.Tech CSE student, and Whisper is my individual project on <strong><code>API rate limiting</code></strong>. I picked rate limiting because it's a real piece of backend infrastructure — the kind of thing that quietly protects every API you've ever used, but that almost no student project actually builds from scratch.
          </p>

          <p className="mt-3 text-base leading-7 text-text-secondary max-w-3xl mx-auto">
            I wanted to do that part from scratch. Whisper itself is a small direct-messaging app where you message anyone by their short user ID. But the messaging is really just a place for the rate limiter to live and be visible — sending too many messages too fast triggers it, and you see exactly what happens. Below is how it works, what it's made of, and how to try it out for yourself.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">What is rate limiting?</h2>
          <p className="text-base text-text-secondary leading-7 max-w-3xl">
            Rate limiting is infrastructure that controls how many API requests a client can make in a time
            window. It protects systems from abuse like brute-force attacks, spam, and denial-of-service,
            while ensuring fair usage. It sits between the client and the application — silently invisible
            until someone crosses the line.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Architecture</h2>
          <div className="w-full bg-surface rounded-2xl p-6 shadow-soft">
            <div className="flex flex-col md:flex-row items-stretch gap-4 md:gap-6 justify-between">
              <div className="flex-1 flex items-center md:justify-start justify-center">
                <div className="box flex items-center justify-center">Client</div>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <div className="box">Auth Middleware</div>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <div className="box box-accent">Rate Limiter Middleware</div>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <div className="box">Route Handler</div>
              </div>

              <div className="flex-1 flex items-center md:justify-end justify-center">
                <div className="box">MongoDB</div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3 text-sm text-text-secondary">
              <div className="col-span-1">
                <div className="font-semibold mb-1">In-memory store</div>
                <div>Fast JavaScript Map storing counters and recent timestamps.</div>
              </div>
              <div className="col-span-1">
                <div className="font-semibold mb-1">Algorithms</div>
                <div>Fixed / Sliding / Token Bucket (selectable strategies).</div>
              </div>
              <div className="col-span-1">
                <div className="font-semibold mb-1">Behavior</div>
                <div>Allowed → continue; Blocked → 429 + Retry-After header.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Three algorithms, three trade-offs</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card p-5">
              <h3 className="font-semibold mb-2">Fixed Window</h3>
              <p className="text-text-secondary text-sm">Counts requests in fixed time buckets. Simple and fast, but allows a 2× burst right at the boundary between two windows.</p>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold mb-2">Sliding Window</h3>
              <p className="text-text-secondary text-sm">Tracks timestamps of recent requests and counts what falls within the last N milliseconds. Fixes the boundary problem; uses a little more memory.</p>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold mb-2">Token Bucket</h3>
              <p className="text-text-secondary text-sm">A bucket of tokens refills at a steady rate; each request spends one. Allows controlled bursts while capping long-run average rate.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Multi-tier protection</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="p-4 rounded-2xl border border-line bg-raised">
              <div className="font-semibold">Burst layer</div>
              <div className="text-text-secondary text-sm">10 messages per 2 seconds (per user)</div>
            </div>
            <div className="p-4 rounded-2xl border border-line bg-raised">
              <div className="font-semibold">Per-user limit</div>
              <div className="text-text-secondary text-sm">150 messages per minute</div>
            </div>
            <div className="p-4 rounded-2xl border border-line bg-raised">
              <div className="font-semibold">Per-pair limit</div>
              <div className="text-text-secondary text-sm">60 messages per minute to one specific person</div>
            </div>
            <div className="p-4 rounded-2xl border border-line bg-raised">
              <div className="font-semibold">Mutation protection</div>
              <div className="text-text-secondary text-sm">5 block/unblock actions per minute (per user) — prevents rapid toggle abuse and protects database writes.</div>
            </div>
          </div>
          <p className="mt-4 text-text-secondary">Each layer catches a different abuse pattern. A request must pass all three to go through.</p>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Three ways to identify a client</h2>
          <ul className="grid gap-3 md:grid-cols-3 text-text-secondary">
            <li><strong>By IP</strong> — for login/signup when no account exists yet.</li>
            <li><strong>By user ID</strong> — for authenticated requests like sending messages.</li>
            <li><strong>By sender→receiver pair</strong> — unique to this project; catches harassment of a specific person.</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Real HTTP behavior</h2>
          <div className="rounded-2xl border border-line p-4 bg-raised">
            <ul className="text-sm text-text-secondary space-y-2">
              <li><code>X-RateLimit-Limit</code> — the maximum allowed in the current window</li>
              <li><code>X-RateLimit-Remaining</code> — how many requests you have left</li>
              <li><code>X-RateLimit-Reset</code> — seconds until the window resets</li>
              <li><code>X-RateLimit-Algorithm</code> — which algorithm was used</li>
              <li><code>Retry-After</code> (on 429) — seconds the client should wait before retrying</li>
            </ul>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">Tech stack</h2>
          <div className="flex flex-wrap gap-3">
            <span className="pill">MongoDB</span>
            <span className="pill">Express</span>
            <span className="pill">React</span>
            <span className="pill">Node.js</span>
            <span className="pill">JWT (httpOnly cookies)</span>
            <span className="pill">In-memory store (Map)</span>
            <span className="pill">Backend: Render</span>
            <span className="pill">Frontend: Vercel</span>
          </div>
          <p className="mt-4 text-text-secondary">The in-memory store is fast and perfect for short-lived, disposable counters. For production across multiple servers, swap in Redis with no changes to the algorithms themselves.</p>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl mb-6">See the rate limiter in action</h2>
          <ol className="list-decimal pl-6 text-text-secondary space-y-2">
            <li>Sign up two accounts (use different browsers or incognito mode).</li>
            <li>Get each account's short user ID from the right-side menu.</li>
            <li>Message rapidly between them.</li>
            <li>Watch the rate-limit meter under the composer drain in real time.</li>
            <li>Try to spam more than ~10 messages in 2 seconds — the burst limiter blocks you with a clear "Blocked" state.</li>
            <li>Try to message a third user during the block — that conversation is unaffected, because the limit is per-pair.</li>
          </ol>
        </section>

        <section className="mb-16 mt-8">
          <h2 className="font-display text-2xl mb-4">Thanks for stopping by</h2>
          <p className="text-base text-text-secondary leading-7 max-w-3xl mx-auto">
            Thanks for taking the time to look through Whisper. If you've made it this far, you've got the gist — a small messaging app sitting on top of a rate limiter I built from scratch. Try sending a few messages, push it until it blocks, and you'll see the whole thing in action.
          </p>
          <p className="mt-3 text-base text-text-secondary leading-7 max-w-3xl mx-auto">
            If anything's broken or you have feedback, I'd genuinely love to hear it.
          </p>
        </section>

        <footer className="mt-12 text-center text-sm text-text-secondary">
          Whisper · API Rate Limiter (Backend Infrastructure) · 2026
        </footer>
      </div>

      <style>{`\n        .box { padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.06); background: white; box-shadow: 0 6px 18px rgba(0,0,0,0.04); }\n        .box-accent { border-color: rgba(99,102,241,0.25); box-shadow: 0 6px 24px rgba(99,102,241,0.06); transform: scale(1.03); }\n        .pill { display: inline-block; padding: 6px 10px; border-radius: 999px; background: rgba(99,102,241,0.06); color: inherit; font-size: 13px; }\n      `}</style>
    </div>
  )
}

import Link from "next/link";

// Bar heights for the waveform, and a stagger so it reads as a voice rather
// than a metronome. Rendered server-side, animated in CSS — no JavaScript.
const WAVE = [
  [10, 0], [18, 120], [28, 240], [40, 60], [24, 300], [44, 180], [16, 420],
  [32, 90], [46, 260], [22, 150], [12, 380], [26, 30], [38, 210], [14, 340],
  [30, 100], [42, 280], [20, 160], [10, 400], [24, 50], [34, 230], [18, 130], [12, 310],
];

const QUESTIONS = [
  ["Full name", "Short text"],
  ["Email", "Email"],
  ["Which year are you in?", "Pick one · 1st · 2nd · 3rd · 4th"],
  ["Do you need a laptop?", "Yes / no"],
  ["Meal preference", "Pick one · Veg · Non-veg · Jain"],
];

export default function Landing() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <nav className="landing-nav">
          <span className="brand">
            <span className="mark">F</span>
            <span>FormAgent</span>
          </span>
          <div className="landing-links">
            <a href="#how">How it works</a>
            <Link className="btn small glass" href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="hero">
          <p className="announce">
            <b>NEW</b>
            Speak in Hindi or English — it understands both
          </p>

          <h1>
            Say it out loud.
            <br />
            <span>Get a form back.</span>
          </h1>

          <p className="hero-lede">
            Describe what you need to collect. FormAgent writes the questions, you check
            them, and everyone gets one link. No dragging fields around.
          </p>

          <Link className="voice" href="/login" aria-label="Start by speaking">
            <span className="voice-btn" aria-hidden="true" />
            <span className="wave" aria-hidden="true">
              {WAVE.map(([h, d], i) => (
                <i key={i} style={{ "--h": `${h}px`, animationDelay: `${d}ms` }} />
              ))}
            </span>
            <span className="voice-label">Start talking</span>
          </Link>

          <p className="hero-said">
            “Collect their name, email, which year they&apos;re in, and whether they need a laptop”
          </p>

          <div className="product" id="how">
            <div className="product-inner">
              <div className="product-said">
                <h4>YOU SAID</h4>
                <p>
                  I&apos;m running a workshop next Saturday. I need their name, email, which
                  year they&apos;re in, whether they need a laptop, and their meal preference.
                </p>
                <p className="turned">↓ 5 questions written</p>
              </div>

              <div className="product-form">
                <div className="product-head">
                  <strong>Workshop registration</strong>
                  <span className="tag accent">just now</span>
                </div>
                {QUESTIONS.map(([label, type]) => (
                  <div className="product-q" key={label}>
                    <span>
                      <b>{label}</b>
                      <small>{type}</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="landing-foot">
          <p>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </p>
          <p style={{ marginTop: 10 }}>Made for people who have better things to do than build forms.</p>
        </footer>
      </div>
    </main>
  );
}

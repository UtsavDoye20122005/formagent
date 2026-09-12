import Link from "next/link";

// Bar heights for the waveform, and a stagger so it reads as a voice rather
// than a metronome. Rendered server-side, animated in CSS — no JavaScript.
const WAVE = [
  [10, 0], [18, 120], [28, 240], [40, 60], [24, 300], [44, 180], [16, 420],
  [32, 90], [46, 260], [22, 150], [12, 380], [26, 30], [38, 210], [14, 340],
  [30, 100], [42, 280], [20, 160], [10, 400], [24, 50], [34, 230], [18, 130], [12, 310],
];

// Deliberately not another registration form. The upload is the thing a plain
// form builder makes painful, and the last question is the one nobody asked
// for — so only that one carries the badge. Claiming credit for the upload
// would be a lie told in the shop window.
const QUESTIONS = [
  ["Your name", "Short text", false],
  ["What do you play?", "Pick one · Guitar · Drums · Keys · Bass · Vocals", false],
  ["How long have you been playing?", "Number · years", false],
  ["Upload a clip of you playing", "File · up to 10 MB", false],
  ["Can you make Saturday rehearsals?", "Yes / no", false],
  ["Anything we should know?", "Long text · optional", true],
];

// The bars under the transcript. Static — it is a picture of a recording that
// already happened, not one in progress.
const CLIP = [6, 11, 19, 28, 14, 22, 9, 17, 26, 12, 20, 8, 15, 24, 10, 18, 7, 13, 21, 9, 16, 6];

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
            “find out who&apos;s coming on the Goa trip and how much everyone has paid so far”
          </p>

          <div className="product" id="how">
            <div className="product-inner">
              <div className="product-said">
                <h4>YOU SAID</h4>
                <p>
                  ok so we&apos;re holding auditions for the college band next month, I need
                  their name, what they play, how long they&apos;ve been playing, a short clip
                  of them actually playing something, and whether they can make Saturday
                  rehearsals
                </p>

                <span className="clip" aria-hidden="true">
                  {CLIP.map((h, i) => (
                    <i key={i} style={{ height: `${h}px` }} />
                  ))}
                  <small>0:19</small>
                </span>

                <p className="turned">↓ 6 questions written</p>
              </div>

              <div className="product-form">
                <div className="product-head">
                  <strong>Band auditions</strong>
                  <span className="tag accent">written in 2s</span>
                </div>
                {QUESTIONS.map(([label, type, inferred]) => (
                  <div className="product-q" key={label}>
                    <span>
                      <b>{label}</b>
                      <small>{type}</small>
                    </span>
                    {inferred && <span className="tag accent tiny">added for you</span>}
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

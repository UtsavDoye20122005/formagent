import Link from "next/link";
import { shownName, avatarUrl, initials } from "../lib/profile.js";

export default function Header({ children, user }) {
  return (
    <header className="nav">
      <Link href="/" className="brand">
        <span className="mark">J</span>
        <span>JiffyThat</span>
      </Link>

      <div className="row" style={{ flexWrap: "nowrap" }}>
        {children}
        {user && (
          <>
            {/* The whole thing is one target — a name you can't click is a
                name people assume they can't change. */}
            <Link className="who" href="/account" title="Your details">
              <span className="dot" aria-hidden="true">
                {avatarUrl(user) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl(user)} alt="" />
                ) : (
                  initials(user)
                )}
              </span>
              <span className="who-name">{shownName(user)}</span>
            </Link>
            <form action="/auth/signout" method="post">
              <button className="btn small ghost" type="submit">Sign out</button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}

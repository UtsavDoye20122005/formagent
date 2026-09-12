import Link from "next/link";

export default function Header({ children, user }) {
  return (
    <header className="nav">
      <Link href="/" className="brand">
        <span className="mark">F</span>
        <span>FormAgent</span>
      </Link>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        {children}
        {user && (
          <>
            <span className="who" title={user.email}>
              <span className="dot" aria-hidden="true">
                {(user.email || "?").slice(0, 1).toUpperCase()}
              </span>
            </span>
            <form action="/auth/signout" method="post">
              <button className="btn small ghost" type="submit">Sign out</button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}

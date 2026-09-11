import Link from "next/link";

export default function Header({ children, user }) {
  return (
    <header className="top">
      <Link href="/" className="brand">
        <span className="mark">F</span>
        <span>FormAgent</span>
      </Link>
      <nav className="nav">
        {children}
        {user && (
          <>
            <span className="who" title={user.email}>{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="btn small ghost" type="submit">Sign out</button>
            </form>
          </>
        )}
      </nav>
    </header>
  );
}

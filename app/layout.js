import "./globals.css";

export const metadata = {
  title: "FormAgent — say it out loud, get a form back",
  description:
    "Say or type what you need to collect. FormAgent writes the form, gives you a link to share, and collects every answer in one place.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Inter is loaded by the browser rather than fetched at build time, so a
            hiccup at Google can never break a deploy. The fallback stack below
            is close enough in metrics that the swap is barely visible. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

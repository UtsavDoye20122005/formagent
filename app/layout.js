import "./globals.css";

export const metadata = {
  title: "FormAgent — describe a form, share the link",
  description:
    "Say or type what you need to collect. FormAgent writes the form, gives you a link to share, and collects every answer in one place.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

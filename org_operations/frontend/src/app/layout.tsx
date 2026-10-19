import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newtonite Operations",
  description: "Role-aware operational work management for Newtonite teams.",
};

const themeScript = `
  (() => {
    const saved = localStorage.getItem("newtonite-theme");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  })();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

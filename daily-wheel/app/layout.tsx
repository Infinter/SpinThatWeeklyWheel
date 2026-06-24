import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Daily Wheel",
  description:
    "Planificateur de Daily Scrum — désigne un animateur par jour ouvré, ordre aléatoire et contraintes respectées.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning : le script anti-flash ci-dessous pose `data-theme` AVANT React (sinon
    // mismatch d'hydratation sur l'attribut). Dark theme switchable (2026-06-24).
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Anti-flash (FOUC) : applique le thème avant le 1er paint. Choix stocké prioritaire, sinon
            prefers-color-scheme. Doit rester synchrone avec lib/ui/theme.ts (clé + logique). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='daily-wheel-theme';var s=localStorage.getItem(k);var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

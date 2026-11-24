import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gabarit.AI Brasil | Concursos públicos",
  description:
    "Explore concursos públicos por estado com o mapa interativo do Gabarit.AI Brasil.",
  icons: {
    icon: "/logo-gabarit-ai.png",
    apple: "/logo-gabarit-ai.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

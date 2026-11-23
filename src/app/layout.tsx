import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gerador de cursos para concursos",
  description: "Encontre ou solicite um curso preparado para o seu concurso.",
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

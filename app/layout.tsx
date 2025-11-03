import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Work OS - Sistema de Gestão de Operações",
  description: "Sistema de gestão de operações para agências",
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

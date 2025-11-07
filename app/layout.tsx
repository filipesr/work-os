import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";

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
    <html suppressHydrationWarning>
      <body>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";
import { ServiceWorkerCleanup } from "@/components/ServiceWorkerCleanup";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s | Work OS",
    default: "Work OS - Sistema de Gestão de Operações",
  },
  description: "Sistema de gestão de operações para agências",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body className={inter.className}>
        <ServiceWorkerCleanup />
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}

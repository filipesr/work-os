import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `<html>` mora aqui, mas o idioma só é conhecido no layout de [locale] —
  // aninhado, e portanto tarde demais para setar o atributo. Sem `lang`, leitor
  // de tela não sabe em que língua pronunciar, e hifenização e tradução
  // automática erram. `getLocale()` lê o locale que o middleware já resolveu.
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <ServiceWorkerCleanup />
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}

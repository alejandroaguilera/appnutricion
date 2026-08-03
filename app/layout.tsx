import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppInit } from "@/components/shared/AppInit";
import { ServiceWorkerRegistrar } from "@/components/shared/ServiceWorkerRegistrar";
import { SyncStatusIndicator } from "@/components/shared/SyncStatusIndicator";
import { InstallPrompt } from "@/components/shared/InstallPrompt";

export const metadata: Metadata = {
  title: "Nutrición",
  description: "Registra tu alimentación diaria contra tu plan de porciones.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nutrición",
  },
};

export const viewport: Viewport = {
  themeColor: "#14100b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen antialiased">
        <AppInit />
        <ServiceWorkerRegistrar />
        {children}
        <SyncStatusIndicator />
        <InstallPrompt />
      </body>
    </html>
  );
}

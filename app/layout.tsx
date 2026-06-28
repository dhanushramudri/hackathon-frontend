import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SidebarProvider } from "@/components/layout/SidebarContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JMAN | ResourceIQ",
  description: "The resourcing co-pilot for JMAN -- evidence-driven staffing, forecasting, and health monitoring.",
  icons: { icon: "/favicon_logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <SidebarProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <Topbar />
                <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
              </div>
            </div>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}

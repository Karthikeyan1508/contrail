import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AppSidebar } from '@/components/app-sidebar';
import { HeaderBreadcrumb } from '@/components/header-breadcrumb';
import { ModeToggle } from '@/components/mode-toggle';
import { ThemeProvider } from '@/components/theme-provider';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SystemStatus } from './system-status';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contrail — governed content supply chain',
  description:
    'Generate airline disruption copy at scale, prove it safe before it ships, assemble it deterministically at runtime.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider delay={200}>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-1 h-4" />
                  <HeaderBreadcrumb />
                  <div className="ml-auto flex items-center gap-3">
                    <SystemStatus />
                    <Separator orientation="vertical" className="h-4" />
                    <ModeToggle />
                  </div>
                </header>
                <main className="flex-1 px-4 py-6 sm:px-6">
                  <div className="mx-auto w-full max-w-[1600px]">{children}</div>
                </main>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

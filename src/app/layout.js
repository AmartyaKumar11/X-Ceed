import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import "./fonts.css";
import "./no-scroll.css";
import "./cursor.css";
import "./sidebar.css";
import "./animations.css";
import "./jobs.css";
import "./rainbowkit-custom.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Web3Provider } from "@/providers/Web3Provider";

export const metadata = {
  title: "X-CEED",
  description: "X-CEED — AI recruitment intelligence",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} light`}
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body className={`${GeistSans.className} antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Web3Provider>
            {children}
            <Toaster />
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}

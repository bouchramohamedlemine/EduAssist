import { AuthButton } from "@/components/auth-button";
import { Hero } from "@/components/hero";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { FooterCopyright } from "@/components/footer-copyright";
import Link from "next/link";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-border/30 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-6 items-center">
              <Link href={"/"} className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                EduAssist
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Suspense>
                <AuthButton />
              </Suspense>
              <ThemeSwitcher />
            </div>
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          <Hero />
        </div>

        <footer className="w-full flex items-center justify-center mx-auto text-center text-xs gap-8 py-16">
          <Suspense fallback={<p className="text-muted-foreground">© EduAssist. All rights reserved.</p>}>
            <FooterCopyright />
          </Suspense>
        </footer>
      </div>
    </main>
  );
}

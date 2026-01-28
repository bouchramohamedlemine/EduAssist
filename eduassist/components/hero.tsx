import Link from "next/link";
import { Button } from "./ui/button";

export function Hero() {
  return (
    <div className="flex flex-col gap-8 items-center">
      <div className="w-full max-w-3xl mx-auto text-center space-y-6">
        <h1 className="text-5xl lg:text-6xl font-bold text-foreground">
          EduAssist
        </h1>
        <p className="text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          AI-powered assistant that helps educators create learning materials by searching through a comprehensive knowledge base
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all px-8">
            <Link href="/ask">Get Started</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

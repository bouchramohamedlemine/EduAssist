import Image from "next/image";
import { LearningObjectivesGenerator } from "@/components/learning-objectives-generator";

export default function LearningObjectivesPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-10 items-center">
      <div className="w-full flex flex-col items-center space-y-4">

        <div className="text-center space-y-3">
          <h1 className="text-4xl lg:text-5xl font-bold text-foreground">
            AI Learning Assistant
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Create learning materials
          </p>
        </div>

        <Image
          src="/images/logo.png"
          alt="EduAssist logo"
          width={140}
          height={140}
          className="rounded-full"
        />

      </div>
      <LearningObjectivesGenerator />
    </div>
  );
}

"use client";

export function FooterCopyright() {
  return (
    <p className="text-muted-foreground">
      © {new Date().getFullYear()} EduAssist. All rights reserved.
    </p>
  );
}

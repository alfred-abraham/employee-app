import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeopleCore | Employee Directory",
  description: "A focused employee information system for modern teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

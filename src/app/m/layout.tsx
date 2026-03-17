import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./mobile.css";
import { isPhoneOnlyUserAgent } from "@/lib/mobile-device";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userAgent = headers().get("user-agent");
  if (!isPhoneOnlyUserAgent(userAgent)) {
    redirect("/dashboard");
  }

  return <div className="tiara-mobile-scope">{children}</div>;
}

import "./mobile.css";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="tiara-mobile-scope">{children}</div>;
}

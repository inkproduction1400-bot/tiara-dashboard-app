import ChatDetailPageClient from "./ChatDetailPageClient";

export default function MobileChatDetailPage({
  params,
}: {
  params: { roomId: string };
}) {
  return <ChatDetailPageClient roomId={params.roomId} />;
}

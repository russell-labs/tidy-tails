import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/AssistantChat";
import { isAgentEnabled, isAgentWritesEnabled } from "@/lib/writeGate";

export const metadata: Metadata = { title: "Assistant" };

// Phase 1 read-only assistant. The whole surface is gated: when the feature
// flag is off, the route does not exist (404) — nothing about the assistant
// leaks until Russell turns it on for Sam. RLS/org scoping is enforced one layer
// down, in the server action the chat calls.
export default function AssistantPage() {
  if (!isAgentEnabled()) {
    notFound();
  }

  // Whether agent WRITES are on decides what the assistant can truthfully claim
  // to do. Resolved here (server-only env) and handed to the chat, which renders
  // the matching capability line and empty-state copy via assistantIntroCopy so
  // the words can never disagree with the actual capability.
  const writesEnabled = isAgentWritesEnabled();

  return (
    <main className="flex min-h-0 flex-1 flex-col px-3 py-4">
      <AssistantChat writesEnabled={writesEnabled} />
    </main>
  );
}

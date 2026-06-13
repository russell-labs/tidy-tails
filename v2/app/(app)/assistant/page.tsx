import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/AssistantChat";
import { isAgentEnabled } from "@/lib/writeGate";

export const metadata: Metadata = { title: "Assistant" };

// Phase 1 read-only assistant. The whole surface is gated: when the feature
// flag is off, the route does not exist (404) — nothing about the assistant
// leaks until Russell turns it on for Sam. RLS/org scoping is enforced one layer
// down, in the server action the chat calls.
export default function AssistantPage() {
  if (!isAgentEnabled()) {
    notFound();
  }

  return (
    <main className="flex flex-col px-3 py-4">
      <div className="mb-3 px-1">
        <h1 className="text-xl font-bold text-ink">Assistant</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Ask about your schedule, clients, and income. It can look things up —
          it can&apos;t book, text, or change anything.
        </p>
      </div>
      <AssistantChat />
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/AssistantChat";
import { assistantIntroCopy } from "@/lib/assistantIntroCopy";
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

  // The intro copy must tell the truth about what the assistant can do, which
  // depends on whether agent WRITES are enabled. Resolved here (server-only env)
  // and shared with the chat's empty-state so the two never disagree.
  const writesEnabled = isAgentWritesEnabled();
  const intro = assistantIntroCopy(writesEnabled);

  return (
    <main className="flex min-h-0 flex-1 flex-col px-3 py-4">
      <div className="mb-3 px-1">
        <h1 className="text-xl font-bold text-ink">Assistant</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{intro.subtitle}</p>
      </div>
      <AssistantChat writesEnabled={writesEnabled} />
    </main>
  );
}

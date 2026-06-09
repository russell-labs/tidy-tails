"use client";

import { useEffect, useState } from "react";
import { isActiveHouseholdSearch, shouldHideBottomNavForSearch } from "@/lib/searchUi";
import { AddHousehold } from "./AddHousehold";
import { ClientSearch } from "./ClientSearch";
import { FirstRunEmptyState } from "./FirstRunEmptyState";
import type { HouseholdCardData } from "./HouseholdCard";

export function HomeSearch({
  households,
  mode,
}: {
  households: HouseholdCardData[];
  mode: "fixtures" | "live";
}) {
  const [query, setQuery] = useState("");
  const activeSearch = isActiveHouseholdSearch(query);
  const hideBottomNav = shouldHideBottomNavForSearch(query);

  useEffect(() => {
    document.body.dataset.tidySearchActive = hideBottomNav ? "true" : "false";

    return () => {
      delete document.body.dataset.tidySearchActive;
    };
  }, [hideBottomNav]);

  // Brand-new business: no households yet. A search box over an empty book is
  // pointless, so show a welcoming first screen whose only action is adding the
  // first client (WS3 Slice C).
  if (households.length === 0) {
    return (
      <main className="px-4 py-6">
        <FirstRunEmptyState
          title="Welcome to Tidy Tails"
          description="Your book is empty. Add your first client and their pets to start booking grooms and tracking your day."
          action={<AddHousehold mode={mode} />}
        />
      </main>
    );
  }

  return (
    <main className={`px-4 transition-[padding] duration-200 ${activeSearch ? "py-3" : "py-5"}`}>
      <div
        aria-hidden={activeSearch}
        className={`overflow-hidden transition-all duration-200 ease-out ${
          activeSearch
            ? "max-h-0 translate-y-[-6px] opacity-0"
            : "mb-4 max-h-56 translate-y-0 opacity-100"
        }`}
      >
        <header className="mb-4">
          <h1 className="text-xl font-bold text-ink">Find a household</h1>
          <p className="text-sm text-ink-soft">
            Search a name, phone, or pet to pull up the right household.
          </p>
        </header>
        <AddHousehold mode={mode} />
      </div>
      <ClientSearch households={households} query={query} onQueryChange={setQuery} />
    </main>
  );
}

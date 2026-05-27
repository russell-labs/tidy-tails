"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  alphabetRailRevealDelay,
  isInAlphabetRailHotZone,
  letterFromRailPoint,
  shouldHandleAlphabetRailScroll,
  shouldRevealAlphabetRail,
  shouldShowContactsResults,
  shouldUseAlphabetRail,
} from "@/lib/alphabetRail";
import { shouldShowSearchClearButton } from "@/lib/searchUi";
import { searchHouseholds, type SearchHousehold } from "@/lib/search";
import { HouseholdCard, type HouseholdCardData } from "./HouseholdCard";

// The Call/Text → Identify → Book wedge (PRD §1.1). Sam types one clue — a
// phone number, an owner's first or last name, a pet name, or a partial/typo'd
// fragment — and pulls up the matching households, ranked. Matching and
// ranking live in lib/search.ts (pure, unit-tested); this component is the
// search box and the result list.

export function ClientSearch({
  households,
  query: controlledQuery,
  onQueryChange,
}: {
  households: HouseholdCardData[];
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [showLetterRail, setShowLetterRail] = useState(false);
  const [isScrubbingLetters, setIsScrubbingLetters] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const railRef = useRef<HTMLElement | null>(null);
  const hideRailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealRailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeLetterRef = useRef<string | null>(null);
  const showLetterRailRef = useRef(false);
  const scrubbingLettersRef = useRef(false);
  const scrollIntentUntilRef = useRef(0);
  const suppressRailUntilRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);

  const byId = useMemo(
    () => new Map(households.map((h) => [h.id, h])),
    [households],
  );

  // The lean shape lib/search.ts matches against — just the searchable fields.
  const searchIndex = useMemo<SearchHousehold[]>(
    () =>
      households.map((h) => ({
        id: h.id,
        firstName: h.firstName,
        lastName: h.lastName,
        phone: h.phone,
        pets: h.pets.map((p) => ({ id: p.id, name: p.name })),
      })),
    [households],
  );

  const results = useMemo(
    () => searchHouseholds(query, searchIndex),
    [query, searchIndex],
  );
  const resultHouseholds = useMemo(
    () =>
      results
        .map((result) => ({
          result,
          household: byId.get(result.household.id),
        }))
        .filter(
          (item): item is {
            result: (typeof results)[number];
            household: HouseholdCardData;
          } => Boolean(item.household),
        ),
    [byId, results],
  );
  const letters = useMemo(() => {
    const seen = new Set<string>();
    return resultHouseholds
      .map(({ household }) => (household.lastName[0] ?? "#").toUpperCase())
      .filter((letter) => {
        const normalized = /[A-Z]/.test(letter) ? letter : "#";
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }, [resultHouseholds]);
  const useAlphabetRail = shouldUseAlphabetRail({
    contactsOpen,
    letterCount: letters.length,
  });
  const showContactsResults = shouldShowContactsResults({
    contactsOpen,
    query,
  });
  const showClearButton = shouldShowSearchClearButton(query);

  useEffect(() => {
    activeLetterRef.current = activeLetter;
  }, [activeLetter]);

  useEffect(() => {
    showLetterRailRef.current = showLetterRail;
  }, [showLetterRail]);

  const scheduleRailHide = useCallback((delay = 950) => {
    if (hideRailTimer.current) clearTimeout(hideRailTimer.current);
    hideRailTimer.current = setTimeout(() => {
      setShowLetterRail(false);
      showLetterRailRef.current = false;
      setActiveLetter(null);
      activeLetterRef.current = null;
    }, delay);
  }, []);

  const hideLetterRail = useCallback(() => {
    if (hideRailTimer.current) clearTimeout(hideRailTimer.current);
    if (revealRailTimer.current) clearTimeout(revealRailTimer.current);
    hideRailTimer.current = null;
    revealRailTimer.current = null;
    setShowLetterRail(false);
    showLetterRailRef.current = false;
    setActiveLetter(null);
    activeLetterRef.current = null;
  }, []);

  const revealLetterRail = useCallback((delay: number) => {
    if (hideRailTimer.current) clearTimeout(hideRailTimer.current);
    if (showLetterRailRef.current) return;

    if (delay <= 0) {
      setShowLetterRail(true);
      showLetterRailRef.current = true;
      return;
    }

    if (revealRailTimer.current) return;

    revealRailTimer.current = setTimeout(() => {
      setShowLetterRail(true);
      showLetterRailRef.current = true;
      revealRailTimer.current = null;
    }, delay);
  }, []);

  const jumpToLetter = useCallback((letter: string, behavior: ScrollBehavior = "auto") => {
    const target = document.getElementById(`household-letter-${letter}`);
    target?.scrollIntoView({ block: "start", behavior });
    setActiveLetter(letter);
    activeLetterRef.current = letter;
    revealLetterRail(0);
  }, [revealLetterRail]);

  const scrubToPoint = useCallback(
    (clientY: number) => {
      const rail = railRef.current;
      if (!rail) return;

      const rect = rail.getBoundingClientRect();
      const letter = letterFromRailPoint({
        y: clientY,
        top: rect.top,
        height: rect.height,
        letters,
      });

      if (!letter || letter === activeLetterRef.current) return;
      jumpToLetter(letter);
    },
    [jumpToLetter, letters],
  );

  useEffect(() => {
    if (!useAlphabetRail) return;

    lastScrollYRef.current = window.scrollY;

    function syncActiveLetterFromScroll() {
      const sections = letters
        .map((letter) => ({
          letter,
          element: document.getElementById(`household-letter-${letter}`),
        }))
        .filter(
          (section): section is { letter: string; element: HTMLElement } =>
            Boolean(section.element),
        );

      if (sections.length === 0) return;

      const headerOffset = 120;
      let current = sections[0].letter;

      for (const section of sections) {
        if (section.element.getBoundingClientRect().top <= headerOffset) {
          current = section.letter;
        } else {
          break;
        }
      }

      setActiveLetter(current);
    }

    function markScrollIntent() {
      scrollIntentUntilRef.current = Date.now() + 450;
    }

    function handleScroll() {
      if (scrollFrameRef.current !== null) return;

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        const currentY = window.scrollY;
        const shouldReveal = shouldRevealAlphabetRail({
          currentY,
          previousY: lastScrollYRef.current,
          hasRecentScrollIntent: Date.now() <= scrollIntentUntilRef.current,
          suppressUntil: suppressRailUntilRef.current,
        });

        lastScrollYRef.current = currentY;

        if (
          !shouldHandleAlphabetRailScroll({
            isVisible: showLetterRailRef.current,
            isScrubbing: scrubbingLettersRef.current,
            shouldReveal,
          })
        ) {
          return;
        }

        if (!scrubbingLettersRef.current) syncActiveLetterFromScroll();
        if (!showLetterRailRef.current || scrubbingLettersRef.current) {
          revealLetterRail(
            alphabetRailRevealDelay({
              isScrubbing: scrubbingLettersRef.current,
            }),
          );
        }
        if (!scrubbingLettersRef.current) scheduleRailHide(2200);
      });
    }

    function handleTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;

      markScrollIntent();

      if (
        Date.now() < suppressRailUntilRef.current ||
        !isInAlphabetRailHotZone({
          x: touch.clientX,
          viewportWidth: window.innerWidth,
        })
      ) {
        return;
      }

      event.preventDefault();
      scrubbingLettersRef.current = true;
      setIsScrubbingLetters(true);
      revealLetterRail(0);
      if (hideRailTimer.current) clearTimeout(hideRailTimer.current);
      scrubToPoint(touch.clientY);
    }

    function stopTouchScrub() {
      if (!scrubbingLettersRef.current) return;
      scrubbingLettersRef.current = false;
      setIsScrubbingLetters(false);
      scheduleRailHide(1800);
    }

    window.addEventListener("touchmove", markScrollIntent, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopTouchScrub, { passive: true });
    window.addEventListener("touchcancel", stopTouchScrub, { passive: true });
    window.addEventListener("wheel", markScrollIntent, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("touchmove", markScrollIntent);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopTouchScrub);
      window.removeEventListener("touchcancel", stopTouchScrub);
      window.removeEventListener("wheel", markScrollIntent);
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [letters, revealLetterRail, scheduleRailHide, scrubToPoint, useAlphabetRail]);

  useEffect(() => {
    return () => {
      if (hideRailTimer.current) clearTimeout(hideRailTimer.current);
      if (revealRailTimer.current) clearTimeout(revealRailTimer.current);
      hideRailTimer.current = null;
      revealRailTimer.current = null;
    };
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          autoFocus
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            suppressRailUntilRef.current = Date.now() + 900;
            hideLetterRail();
          }}
          onBlur={() => {
            lastScrollYRef.current = window.scrollY;
          }}
          placeholder="Search a name, phone, or pet"
          aria-label="Search households by owner name, phone, or pet name"
          className="w-full rounded-xl border border-line bg-surface py-3 pl-11 pr-12 text-base text-ink placeholder:text-ink-faint"
        />
        {showClearButton ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              hideLetterRail();
              suppressRailUntilRef.current = Date.now() + 600;
            }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-canvas text-ink-soft active:bg-brand-soft active:text-brand"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      <p className="mt-3 px-1 text-xs text-ink-faint">
        {results.length} {results.length === 1 ? "household" : "households"}
        {query.trim() ? ` matching “${query.trim()}”` : ""}
      </p>

      <details
        className="group mt-4 overflow-hidden rounded-xl border border-line bg-surface"
        open={showContactsResults}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (query.trim()) return;
          setContactsOpen(open);
          if (!open) hideLetterRail();
        }}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              Contacts
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              {results.length} {results.length === 1 ? "household" : "households"}
              {query.trim() ? " matching this search" : " in the list"}
            </p>
          </div>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft transition group-open:rotate-180"
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>
        <div className="border-t border-line bg-canvas/40 px-2.5 py-2.5">
          {results.length === 0 ? (
            <p className="py-5 text-center text-sm text-ink-soft">
              No households match that search.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {resultHouseholds.map(({ result, household }, index) => {
                const letter = (household.lastName[0] ?? "#").toUpperCase();
                const normalizedLetter = /[A-Z]/.test(letter) ? letter : "#";
                const previous = resultHouseholds[index - 1]?.household;
                const previousLetter = previous
                  ? (previous.lastName[0] ?? "#").toUpperCase()
                  : null;
                const startsGroup =
                  index === 0 ||
                  normalizedLetter !==
                    (previousLetter && /[A-Z]/.test(previousLetter)
                      ? previousLetter
                      : "#");
                return (
                  <li
                    key={result.household.id}
                    id={startsGroup ? `household-letter-${normalizedLetter}` : undefined}
                    className={startsGroup ? "scroll-mt-24" : ""}
                  >
                    <HouseholdCard
                      household={household}
                      matchedPetIds={result.matchedPetIds}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>

      {useAlphabetRail ? (
        <nav
          ref={railRef}
          aria-label="Jump through households alphabetically"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            scrubbingLettersRef.current = true;
            setIsScrubbingLetters(true);
            revealLetterRail(0);
            if (hideRailTimer.current) clearTimeout(hideRailTimer.current);
            scrubToPoint(event.clientY);
          }}
          onPointerMove={(event) => {
            if (!scrubbingLettersRef.current) return;
            event.preventDefault();
            scrubToPoint(event.clientY);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            scrubbingLettersRef.current = false;
            setIsScrubbingLetters(false);
            scheduleRailHide(1800);
          }}
          onPointerCancel={() => {
            scrubbingLettersRef.current = false;
            setIsScrubbingLetters(false);
            scheduleRailHide(1800);
          }}
          className={`fixed right-0 top-1/2 z-20 flex w-12 -translate-y-1/2 touch-none select-none justify-end py-1 pr-1 transition-opacity duration-200 ease-out ${
            showLetterRail || isScrubbingLetters
              ? "opacity-100"
              : "opacity-0"
          }`}
        >
          <div
            className={`flex flex-col items-center rounded-full border border-line bg-surface/95 px-1 py-1 shadow-sm backdrop-blur transition-transform duration-200 ease-out ${
              showLetterRail || isScrubbingLetters
                ? "translate-x-0 scale-100"
                : "translate-x-2 scale-95"
            }`}
          >
            {letters.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => {
                  jumpToLetter(letter);
                  scheduleRailHide(2200);
                }}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  activeLetter === letter
                    ? "bg-brand text-white"
                    : "text-brand"
                }`}
                aria-label={`Jump to ${letter}`}
              >
                {letter}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      {activeLetter && (showLetterRail || isScrubbingLetters) ? (
        <div
          aria-hidden="true"
          className={`fixed right-12 top-1/2 z-30 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-2xl bg-ink text-3xl font-bold text-white shadow-lg transition-all duration-150 ease-out ${
            isScrubbingLetters
              ? "scale-100 opacity-100"
              : "scale-95 opacity-0"
          }`}
        >
          {activeLetter}
        </div>
      ) : null}
    </div>
  );
}

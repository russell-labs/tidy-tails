"use client";

import { useActionState, useState } from "react";
import {
  deletePetProfile,
  markPetPassedAway,
  mergeDuplicatePetProfiles,
  type PetLifecycleState,
} from "@/lib/actions/petLifecycle";
import type { Client, Pet } from "@/lib/data/types";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

function Result({
  state,
  onDone,
}: {
  state: Extract<
    PetLifecycleState,
    { status: "demo" | "gated" | "saved" | "merged" | "deleted" }
  >;
  onDone: () => void;
}) {
  const ok =
    state.status === "saved" ||
    state.status === "merged" ||
    state.status === "deleted";
  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`rounded-xl p-3.5 ${
          ok ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
        }`}
      >
        <p className="text-sm font-semibold">
          {state.status === "deleted"
            ? "Deleted"
            : state.status === "merged"
              ? "Merged"
            : state.status === "saved"
              ? "Saved"
              : state.status === "demo"
                ? "Demo only"
                : "Not saved"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed">{state.message}</p>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
      >
        Done
      </button>
    </div>
  );
}

export function PetLifecycleActions({
  client,
  pet,
  pets,
  clients,
  hasAppointments,
  isPassedAway,
}: {
  client: Client;
  pet: Pet;
  pets: Pet[];
  clients: Client[];
  hasAppointments: boolean;
  isPassedAway: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [duplicatePetId, setDuplicatePetId] = useState("");
  const [passedState, passedAction, passedPending] = useActionState<
    PetLifecycleState,
    FormData
  >(markPetPassedAway, { status: "idle" });
  const [mergeState, mergeAction, mergePending] = useActionState<
    PetLifecycleState,
    FormData
  >(mergeDuplicatePetProfiles, { status: "idle" });
  const [deleteState, deleteAction, deletePending] = useActionState<
    PetLifecycleState,
    FormData
  >(deletePetProfile, { status: "idle" });
  const pending = passedPending || mergePending || deletePending;
  const otherPets = pets.filter((candidate) => candidate.id !== pet.id);
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft active:bg-canvas"
      >
        Profile cleanup
      </button>
      <Sheet open={open} onClose={close} title="Profile cleanup">
        <SubmitDogOverlay label="Updating pet profile" show={pending} />
        {passedState.status === "saved" ||
        passedState.status === "demo" ||
        passedState.status === "gated" ? (
          <Result state={passedState} onDone={close} />
        ) : mergeState.status === "merged" ||
          mergeState.status === "demo" ||
          mergeState.status === "gated" ? (
          <Result state={mergeState} onDone={close} />
        ) : deleteState.status === "deleted" ||
          deleteState.status === "demo" ||
          deleteState.status === "gated" ? (
          <Result state={deleteState} onDone={close} />
        ) : (
          <div className="flex flex-col gap-3.5">
            {passedState.status === "error" ? (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                {passedState.message}
              </p>
            ) : null}
            {deleteState.status === "error" ? (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                {deleteState.message}
              </p>
            ) : null}
            {mergeState.status === "error" ? (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                {mergeState.message}
              </p>
            ) : null}

            <section className="rounded-xl border border-line bg-surface px-3.5 py-3">
              <h3 className="text-sm font-semibold text-ink">
                Merge duplicate dog file
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Keeps this {pet.name} profile, moves the duplicate&apos;s
                appointment history into it, preserves useful notes, and removes
                the duplicate file.
              </p>
              {otherPets.length === 0 ? (
                <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs font-medium text-ink-soft">
                  There are no other dog files to merge.
                </p>
              ) : (
                <form action={mergeAction} className="mt-3 flex flex-col gap-2.5">
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="keep_pet_id" value={pet.id} />
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
                    Duplicate file to merge into {pet.name}
                    <select
                      name="duplicate_pet_id"
                      value={duplicatePetId}
                      onChange={(event) => setDuplicatePetId(event.target.value)}
                      className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-ink"
                    >
                      <option value="">Choose duplicate dog file</option>
                      {otherPets.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {petOptionLabel(candidate, clientsById.get(candidate.client_id))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={pending || !duplicatePetId}
                    className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white active:bg-brand-ink disabled:opacity-60"
                  >
                    Merge into this profile
                  </button>
                </form>
              )}
            </section>

            <section className="rounded-xl border border-line bg-surface px-3.5 py-3">
              <h3 className="text-sm font-semibold text-ink">
                Mark passed away
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Keeps {pet.name}&apos;s history, adds a clear status, and removes
                the dog from active booking choices.
              </p>
              <form action={passedAction} className="mt-3">
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="pet_id" value={pet.id} />
                <button
                  type="submit"
                  disabled={pending || isPassedAway}
                  className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white active:bg-brand-ink disabled:opacity-60"
                >
                  {isPassedAway ? "Already marked passed away" : "Mark passed away"}
                </button>
              </form>
            </section>

            <section className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-danger-ink">
              <h3 className="text-sm font-semibold">Delete mistaken profile</h3>
              <p className="mt-1 text-xs leading-relaxed">
                Temporary cleanup for duplicate imported profiles. This is only
                allowed when the pet has no appointment history.
              </p>
              {hasAppointments ? (
                <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs font-medium">
                  This pet has appointment history, so deletion is blocked.
                </p>
              ) : null}
              <form action={deleteAction} className="mt-3">
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="pet_id" value={pet.id} />
                <button
                  type="submit"
                  disabled={pending || hasAppointments}
                  className="w-full rounded-xl bg-danger-ink px-4 py-3 text-sm font-semibold text-white active:opacity-90 disabled:opacity-50"
                >
                  Delete this pet profile
                </button>
              </form>
            </section>
          </div>
        )}
      </Sheet>
    </>
  );
}

function petOptionLabel(pet: Pet, client?: Client): string {
  const parts = [pet.name, pet.breed, pet.color].filter(Boolean);
  const petLabel = parts.join(" - ") || pet.id;
  if (!client) return petLabel;
  const owner = `${client.first_name} ${client.last_name}`.trim();
  return owner ? `${petLabel} (${owner})` : petLabel;
}

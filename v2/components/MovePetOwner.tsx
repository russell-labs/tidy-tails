"use client";

import { useActionState, useMemo, useState } from "react";
import {
  movePetOwner,
  type MovePetOwnerState,
} from "@/lib/actions/movePetOwner";
import type { Client, Pet } from "@/lib/data/types";
import { fullName, formatPhone } from "@/lib/format";
import {
  searchMoveOwnerTargets,
  validateMovePetOwner,
  type MovePetOwnerErrors,
} from "@/lib/movePetOwner";
import { Sheet } from "./Sheet";
import { SubmitDogOverlay } from "./SubmitDog";

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink";

export function MovePetOwner({
  pet,
  currentClient,
  clients,
  mode,
  writesEnabled,
}: {
  pet: Pet;
  currentClient: Client;
  clients: Client[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const otherClients = clients
    .filter((client) => client.id !== currentClient.id)
    .sort((a, b) =>
      fullName(a.first_name, a.last_name).localeCompare(
        fullName(b.first_name, b.last_name),
      ),
    );

  function close() {
    setOpen(false);
    setFormKey((key) => key + 1);
  }

  if (otherClients.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-brand active:bg-brand-soft"
      >
        Change owner / household
      </button>
      <Sheet open={open} onClose={close} title="Change owner / household">
        <MovePetOwnerForm
          key={formKey}
          pet={pet}
          currentClient={currentClient}
          clients={otherClients}
          mode={mode}
          writesEnabled={writesEnabled}
          onDone={close}
        />
      </Sheet>
    </>
  );
}

function MovePetOwnerForm({
  pet,
  currentClient,
  clients,
  mode,
  writesEnabled,
  onDone,
}: {
  pet: Pet;
  currentClient: Client;
  clients: Client[];
  mode: "fixtures" | "live";
  writesEnabled: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<MovePetOwnerState, FormData>(
    movePetOwner,
    { status: "idle" },
  );
  const [step, setStep] = useState<"form" | "review">("form");
  const [errors, setErrors] = useState<MovePetOwnerErrors>({});
  const [moveMode, setMoveMode] = useState<"existing" | "new">("existing");
  const [toClientId, setToClientId] = useState(clients[0]?.id ?? "");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [newOwnerFirstName, setNewOwnerFirstName] = useState("");
  const [newOwnerLastName, setNewOwnerLastName] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");
  const visibleClients = useMemo(
    () => searchMoveOwnerTargets(ownerQuery, clients).slice(0, 25),
    [clients, ownerQuery],
  );
  const selectedClientId =
    moveMode === "existing" &&
    visibleClients.length > 0 &&
    !visibleClients.some((client) => client.id === toClientId)
      ? visibleClients[0].id
      : toClientId;
  const target =
    clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const targetName =
    moveMode === "new"
      ? `${newOwnerFirstName} ${newOwnerLastName}`.trim()
      : fullName(target.first_name, target.last_name);

  function toReview() {
    const validation = validateMovePetOwner({
      pet_id: pet.id,
      from_client_id: currentClient.id,
      move_mode: moveMode,
      to_client_id: selectedClientId,
      new_owner_first_name: newOwnerFirstName,
      new_owner_last_name: newOwnerLastName,
      new_owner_phone: newOwnerPhone,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setStep("review");
  }

  if (
    state.status === "demo" ||
    state.status === "gated" ||
    state.status === "saved"
  ) {
    return <ResultScreen state={state} onDone={onDone} />;
  }

  const formError =
    state.status === "error"
      ? (state.formError ?? "Please check the owner change and try again.")
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <SubmitDogOverlay label="Moving pet" show={pending} />
      <input type="hidden" name="pet_id" value={pet.id} />
      <input type="hidden" name="from_client_id" value={currentClient.id} />
      <input type="hidden" name="move_mode" value={moveMode} />
      <input type="hidden" name="to_client_id" value={selectedClientId} />
      <input
        type="hidden"
        name="new_owner_first_name"
        value={newOwnerFirstName}
      />
      <input
        type="hidden"
        name="new_owner_last_name"
        value={newOwnerLastName}
      />
      <input type="hidden" name="new_owner_phone" value={newOwnerPhone} />

      <ModeNote mode={mode} writesEnabled={writesEnabled} />

      {formError ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <>
          <p className="rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-soft">
            This moves {pet.name} and that dog&apos;s appointment history to the
            selected household.
          </p>

          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Owner move type</legend>
            <button
              type="button"
              onClick={() => setMoveMode("existing")}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                moveMode === "existing"
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : "border-line bg-surface text-ink-soft"
              }`}
            >
              Existing
            </button>
            <button
              type="button"
              value="new"
              onClick={() => setMoveMode("new")}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                moveMode === "new"
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : "border-line bg-surface text-ink-soft"
              }`}
            >
              Create new
            </button>
          </fieldset>

          {moveMode === "existing" ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-soft">
                  New owner
                </span>
                <input
                  type="search"
                  value={ownerQuery}
                  onChange={(event) => setOwnerQuery(event.target.value)}
                  placeholder="Search owner, phone, or household"
                  className={fieldClass}
                />
              </label>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1">
                {visibleClients.length > 0 ? (
                  visibleClients.map((client) => {
                    const selected = client.id === selectedClientId;
                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => setToClientId(client.id)}
                        className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${
                          selected
                            ? "bg-brand-soft text-brand-ink"
                            : "text-ink active:bg-canvas"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {fullName(client.first_name, client.last_name)}
                          </span>
                          <span className="block truncate text-xs text-ink-soft">
                            {formatPhone(client.phone)}
                          </span>
                        </span>
                        {selected ? (
                          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-4 text-sm text-ink-soft">
                    No matching owner. Use Create new if this household is not in
                    the database yet.
                  </p>
                )}
              </div>
              {errors.to_client_id ? (
                <span className="text-xs text-danger-ink">
                  {errors.to_client_id}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-soft">
                  New owner first name
                </span>
                <input
                  type="text"
                  name="new_owner_first_name"
                  value={newOwnerFirstName}
                  onChange={(event) => setNewOwnerFirstName(event.target.value)}
                  placeholder="Marina"
                  className={fieldClass}
                />
                {errors.new_owner_first_name ? (
                  <span className="text-xs text-danger-ink">
                    {errors.new_owner_first_name}
                  </span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-soft">
                  New owner last name
                </span>
                <input
                  type="text"
                  name="new_owner_last_name"
                  value={newOwnerLastName}
                  onChange={(event) => setNewOwnerLastName(event.target.value)}
                  placeholder="Kitchen"
                  className={fieldClass}
                />
                {errors.new_owner_last_name ? (
                  <span className="text-xs text-danger-ink">
                    {errors.new_owner_last_name}
                  </span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-soft">
                  Phone (optional)
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  name="new_owner_phone"
                  value={newOwnerPhone}
                  onChange={(event) => setNewOwnerPhone(event.target.value)}
                  placeholder="Can be added later"
                  className={fieldClass}
                />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={toReview}
            className="rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Review owner change
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            Move <span className="font-semibold">{pet.name}</span> from{" "}
            <span className="font-semibold">
              {fullName(currentClient.first_name, currentClient.last_name)}
            </span>{" "}
            to{" "}
            <span className="font-semibold">
              {targetName}
            </span>
            ?
          </p>
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
            This also moves existing appointment rows for this dog so history,
            reports, and future booking context follow the right owner.
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setStep("form")}
              disabled={pending}
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base font-semibold text-ink-soft active:bg-canvas disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink disabled:opacity-50"
            >
              Confirm move
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function ModeNote({
  mode,
  writesEnabled,
}: {
  mode: "fixtures" | "live";
  writesEnabled: boolean;
}) {
  if (mode === "fixtures") {
    return (
      <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
        Demo mode - confirming will not move anything.
      </p>
    );
  }
  return (
    <p
      className={`rounded-lg px-3 py-2 text-xs font-medium ${
        writesEnabled ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
      }`}
    >
      {writesEnabled
        ? "Production mode - confirming moves this dog to the selected household."
        : "Production mode - the server will confirm the write gate before moving anything."}
    </p>
  );
}

function ResultScreen({
  state,
  onDone,
}: {
  state: Extract<MovePetOwnerState, { status: "demo" | "gated" | "saved" }>;
  onDone: () => void;
}) {
  const headline =
    state.status === "saved"
      ? "Moved - owner updated"
      : state.status === "demo"
        ? "Demo only - nothing was moved"
        : "Not moved - owner changes are switched off";
  const detail =
    state.status === "gated"
      ? state.message
      : `${state.summary.petName}: ${state.summary.fromOwnerName} → ${state.summary.toOwnerName}`;

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={`rounded-xl p-3.5 ${
          state.status === "saved"
            ? "bg-brand-soft text-brand-ink"
            : "bg-warn-soft text-warn"
        }`}
      >
        <p className="text-sm font-semibold">{headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed">{detail}</p>
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

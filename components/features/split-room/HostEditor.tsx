"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Amount, Button, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CURRENCIES, fromMinor, toMinor, type CurrencyCode } from "@/lib/money";
import { useQueryClient } from "@tanstack/react-query";
import { latestRoom, useSaveItems } from "@/lib/queries/rooms";
import { roomCharges, type RoomData } from "@/lib/split-room-data";
import { CHARGE_KEYS, MAX_QTY, parsePercentBp, type Charge, type ChargeKey, type RoomCharges } from "@/lib/splitRoom";
import { uuid } from "@/lib/uuid";

const LABEL: Record<ChargeKey, string> = { tax: "Tax", service: "Service charge", tip: "Tip" };

/** Price text → minor units, or null. */
function parsePrice(text: string, currency: CurrencyCode): number | null {
  try {
    const v = toMinor(text.trim(), currency);
    return v > BigInt(0) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : null;
  } catch {
    return null;
  }
}

function chargeText(c: Charge, currency: CurrencyCode) {
  if (c.value === 0) return "";
  return c.kind === "percent" ? String(c.value / 100) : fromMinor(c.value, currency);
}

/**
 * Host: add the bill fast. Name → price → qty → Add, and the keyboard stays up for the next item
 * (the Add button never takes focus). Tap an item to edit it. Tax / service / tip as % or amount.
 */
export function HostEditor({ open, onClose, code, d, currency }: { open: boolean; onClose: () => void; code: string; d: RoomData; currency: CurrencyCode }) {
  return (
    <Sheet open={open} onClose={onClose} title="Bill items">
      <EditorBody code={code} d={d} currency={currency} onDone={onClose} />
    </Sheet>
  );
}

function EditorBody({ code, d, currency, onDone }: { code: string; d: RoomData; currency: CurrencyCode; onDone: () => void }) {
  const save = useSaveItems(code);
  const qc = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState(d.room.name);
  const symbol = CURRENCIES[currency].symbol;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Always build on the latest list (optimistic adds included), never a render-time snapshot.
  const currentItems = () => (latestRoom(qc, code) ?? d).items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty }));

  const submit = () => {
    const n = name.trim();
    const p = parsePrice(price, currency);
    const q = Number(qty || "1");
    if (!n) return setError("What's the item called?");
    if (n.length > 60) return setError("Keep the name under 60 characters.");
    if (p === null) return setError(`Enter a price like 250 or 249.50`);
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) return setError(`Quantity is 1 to ${MAX_QTY}.`);
    const items = currentItems();
    const next = editId
      ? items.map((i) => (i.id === editId ? { ...i, name: n, price: p, qty: q } : i))
      : [...items, { id: uuid(), name: n, price: p, qty: q }];
    save.mutate({ roomId: d.room.id, items: next });
    setName("");
    setPrice("");
    setQty("1");
    setEditId(null);
    setError(null);
    nameRef.current?.focus();
  };

  const remove = (id: string) => {
    save.mutate({ roomId: d.room.id, items: currentItems().filter((i) => i.id !== id) });
    if (editId === id) {
      setEditId(null);
      setName("");
      setPrice("");
      setQty("1");
    }
  };

  const field = "h-12 w-full rounded-2xl border-[1.5px] border-ink/15 bg-surface px-4 text-[16px] font-medium outline-none focus:border-ink";

  return (
    <div className="pb-2">
      <label className="micro text-ink-faded" htmlFor="room-name">
        Room name
      </label>
      <input
        id="room-name"
        value={roomName}
        maxLength={60}
        onChange={(e) => setRoomName(e.target.value)}
        onBlur={() => {
          const v = roomName.trim();
          if (v && v !== d.room.name) save.mutate({ roomId: d.room.id, name: v });
          else setRoomName(d.room.name);
        }}
        className={cn(field, "mt-1")}
      />

      <form
        className="mt-5 rounded-card border-[1.5px] border-ink/[0.08] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="micro mb-2 text-ink-faded">{editId ? "Edit item" : "Add item"}</p>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item, e.g. Margherita"
          aria-label="Item name"
          enterKeyHint="next"
          autoComplete="off"
          className={field}
        />
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-ink/40">{symbol}</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price each"
              aria-label="Price each"
              inputMode="decimal"
              enterKeyHint="done"
              className={cn(field, "pl-9")}
            />
          </div>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 3))}
            aria-label="Quantity"
            inputMode="numeric"
            enterKeyHint="done"
            className={cn(field, "w-20 text-center")}
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[13px] font-medium text-owe-ink">
            {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          {editId && (
            <Button
              variant="ghost"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setEditId(null);
                setName("");
                setPrice("");
                setQty("1");
              }}
            >
              Cancel
            </Button>
          )}
          {/* preventDefault on pointer-down keeps focus (and the phone keyboard) where it is. */}
          <Button type="submit" variant="secondary" fullWidth onPointerDown={(e) => e.preventDefault()}>
            <Plus className="size-4" strokeWidth={2.5} />
            {editId ? "Save item" : "Add item"}
          </Button>
        </div>
      </form>

      {d.items.length > 0 && (
        <ul className="mt-4 divide-y divide-ink/[0.06] rounded-card border-[1.5px] border-ink/[0.08]">
          {d.items.map((i) => (
            <li key={i.id} className={cn("flex items-center gap-2 pl-4", editId === i.id && "bg-ink/[0.04]")}>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-baseline gap-2 py-3 text-left"
                onClick={() => {
                  setEditId(i.id);
                  setName(i.name);
                  setPrice(fromMinor(i.price, currency));
                  setQty(String(i.qty));
                  nameRef.current?.focus();
                }}
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {i.qty > 1 ? `${i.qty} × ` : ""}
                  {i.name}
                </span>
                <Amount amount={i.price * i.qty} currency={currency} size="sm" />
              </button>
              <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`} className="flex size-11 items-center justify-center text-ink/50">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ChargesEditor d={d} currency={currency} onSave={(charges) => save.mutate({ roomId: d.room.id, charges })} />

      <Button fullWidth className="mt-6" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function ChargesEditor({ d, currency, onSave }: { d: RoomData; currency: CurrencyCode; onSave: (c: RoomCharges) => void }) {
  const saved = roomCharges(d.room);
  const [kinds, setKinds] = useState<Record<ChargeKey, Charge["kind"]>>({ tax: saved.tax.kind, service: saved.service.kind, tip: saved.tip.kind });
  const [texts, setTexts] = useState<Record<ChargeKey, string>>({
    tax: chargeText(saved.tax, currency),
    service: chargeText(saved.service, currency),
    tip: chargeText(saved.tip, currency),
  });
  const [errors, setErrors] = useState<Partial<Record<ChargeKey, string>>>({});

  const commit = (nextKinds = kinds, nextTexts = texts) => {
    const out = { ...saved };
    const errs: Partial<Record<ChargeKey, string>> = {};
    for (const k of CHARGE_KEYS) {
      const t = nextTexts[k].trim();
      if (!t) {
        out[k] = { kind: nextKinds[k], value: 0 };
        continue;
      }
      const v = nextKinds[k] === "percent" ? parsePercentBp(t) : (() => {
        try {
          const m = toMinor(t, currency);
          return m >= BigInt(0) && m <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(m) : null;
        } catch {
          return null;
        }
      })();
      if (v === null) errs[k] = nextKinds[k] === "percent" ? "0 to 100, up to 2 decimals" : "Enter an amount";
      else out[k] = { kind: nextKinds[k], value: v };
    }
    setErrors(errs);
    const changed = CHARGE_KEYS.some((k) => out[k].kind !== saved[k].kind || out[k].value !== saved[k].value);
    if (Object.keys(errs).length === 0 && changed) onSave(out);
  };

  return (
    <div className="mt-6">
      <p className="micro mb-2 text-ink-faded">Tax, service, tip · spread by what each person had</p>
      <div className="space-y-2">
        {CHARGE_KEYS.map((k) => (
          <div key={k}>
            <div className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[15px] font-semibold">{LABEL[k]}</span>
              <input
                value={texts[k]}
                onChange={(e) => setTexts((t) => ({ ...t, [k]: e.target.value }))}
                onBlur={() => commit()}
                inputMode="decimal"
                placeholder="0"
                aria-label={`${LABEL[k]} ${kinds[k] === "percent" ? "percent" : "amount"}`}
                className="h-11 min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink/15 bg-surface px-3 text-right text-[16px] font-medium outline-none focus:border-ink"
              />
              <div className="flex shrink-0 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={`${LABEL[k]} as`}>
                {(["percent", "amount"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={kinds[k] === kind}
                    onClick={() => {
                      const nk = { ...kinds, [k]: kind };
                      setKinds(nk);
                      commit(nk);
                    }}
                    className={cn("h-9 min-w-9 rounded-full px-2 text-[14px] font-semibold", kinds[k] === kind ? "bg-surface shadow-sm" : "text-ink/50")}
                  >
                    {kind === "percent" ? "%" : CURRENCIES[currency].symbol}
                  </button>
                ))}
              </div>
            </div>
            {errors[k] && <p className="mt-1 text-right text-[12px] font-medium text-owe-ink">{errors[k]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

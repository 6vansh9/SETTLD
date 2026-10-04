"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import {
  Amount,
  Avatar,
  AvatarStack,
  Button,
  Card,
  CardStack,
  Numpad,
  PrivacyToggle,
  Sheet,
  Switch,
  SplitBar,
  ThemeToggle,
  Title,
  type AmountSize,
} from "@/components/ui";
import { usePrivacy } from "@/components/providers/PrivacyProvider";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/money";
import { fade, spring } from "@/lib/motion";
import { PASTELS, type Pastel } from "@/lib/pastels";

const PEOPLE: { name: string; color: Pastel; ghost?: boolean }[] = [
  { name: "Vansh Gupta", color: "pink" },
  { name: "Aman Rao", color: "sky" },
  { name: "Rahul Mehta", color: "mint" },
  { name: "Priya Shah", color: "butter" },
  { name: "Kabir Das", color: "lilac" },
  { name: "Neha Iyer", color: "peach" },
  { name: "Zoya Khan", color: "pink", ghost: true },
];

const GROUPS: {
  name: string;
  emoji: string;
  color: Pastel;
  date: string;
  members: number;
  balance: number;
  currency: CurrencyCode;
}[] = [
  { name: "GOA TRIP", emoji: "🏝️", color: "pink", date: "12 SEP", members: 6, balance: -340050, currency: "INR" },
  { name: "FLAT 4B", emoji: "🏠", color: "sky", date: "01 OCT", members: 3, balance: 1240000, currency: "INR" },
  { name: "DINNER CLUB", emoji: "🍜", color: "mint", date: "28 SEP", members: 5, balance: 86025, currency: "INR" },
  { name: "BALI '26", emoji: "🌋", color: "butter", date: "19 AUG", members: 4, balance: -12099, currency: "USD" },
  { name: "SUBSCRIPTIONS", emoji: "📺", color: "lilac", date: "03 OCT", members: 2, balance: 0, currency: "INR" },
  { name: "OFFICE CHAI", emoji: "☕", color: "peach", date: "TODAY", members: 7, balance: -4500, currency: "INR" },
];

const SIZES: AmountSize[] = ["sm", "md", "lg", "xl", "hero"];

export default function KitPage() {
  return (
    <main className="mx-auto w-full max-w-app px-5 pb-[calc(48px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span className="micro">Settld · UI Kit</span>
        <div className="flex items-center gap-2">
          <PrivacyToggle />
          <ThemeToggle />
        </div>
      </header>

      <div className="mt-10">
        <Title line1="UI" line2="KIT" size="xl" />
        <p className="mt-4 max-w-[300px] text-[15px] font-medium text-ink/70">
          Every component in Settld, every variant. Milestone 1 — Foundation.
        </p>
      </div>

      <TitlesSection />
      <AmountsSection />
      <CardsSection />
      <SplitBarSection />
      <AvatarsSection />
      <ButtonsSection />
      <SheetSection />
      <NumpadSection />
    </main>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
      <div className="mb-6 flex items-baseline gap-3 border-b-[1.5px] border-ink/10 pb-3">
        <span className="font-num text-[40px] leading-none text-ink-faded">
          {String(n).padStart(2, "0")}
        </span>
        <h2 className="font-display-alt text-[36px] uppercase leading-none">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="micro mb-3 text-ink-faded">{children}</p>;
}

function TitlesSection() {
  return (
    <Section n={1} title="Titles">
      <div className="space-y-8">
        <Title line1="SETTLD" line2="GROUPS" size="xl" as="h3" />
        <Title line1="GOA" line2="TRIP" size="lg" as="h3" />
        <Title line1="YOUR" line2="BALANCES" size="md" as="h3" />
      </div>
    </Section>
  );
}

function AmountsSection() {
  const { blurred, toggle } = usePrivacy();

  return (
    <Section n={2} title="Amounts">
      <Label>Sizes · INR</Label>
      <div className="space-y-3">
        {SIZES.map((size) => (
          <div key={size} className="flex items-baseline justify-between gap-4 overflow-hidden">
            <span className="micro w-10 shrink-0 text-ink-faded">{size}</span>
            <Amount amount={124050} currency="INR" size={size} />
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Label>Currencies · Indian vs Western grouping</Label>
        <div className="space-y-2">
          {CURRENCY_CODES.map((c) => (
            <div key={c} className="flex items-baseline justify-between">
              <span className="micro text-ink-faded">{c}</span>
              <Amount amount={12400050} currency={c} size="lg" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Card>
          <p className="micro text-owe">You owe</p>
          <Amount amount={34050} currency="INR" size="md" sign="owe" className="mt-3" />
        </Card>
        <Card>
          <p className="micro text-owed">You&apos;re owed</p>
          <Amount amount={1240000} currency="INR" size="md" sign="owed" className="mt-3" />
        </Card>
      </div>

      <div className="mt-8 flex items-center justify-between rounded-card border-[1.5px] border-ink/[0.08] bg-surface p-5">
        <div>
          <p className="micro text-ink-faded">Privacy blur</p>
          <p className="mt-1 text-[13px] font-medium text-ink/70">
            {blurred ? "Tap any amount to peek for 2s" : "Hides every amount"}
          </p>
        </div>
        <Button variant={blurred ? "primary" : "secondary"} onClick={toggle} className="h-11 text-[16px]">
          {blurred ? "Blur on" : "Blur off"}
        </Button>
      </div>
    </Section>
  );
}

function CardsSection() {
  return (
    <Section n={3} title="Cards">
      <Label>Single</Label>
      <Card color="butter" dogEar>
        <div className="flex items-start justify-between">
          <AvatarStack people={PEOPLE.slice(0, 3)} size="sm" className="[--avatar-ring:var(--butter)]" />
          <span className="micro opacity-60">Today</span>
        </div>
        <h3 className="mt-6 font-display-alt text-[40px] uppercase leading-[0.9]">
          Cab to
          <br />
          airport
        </h3>
        <div className="mt-6 flex items-end justify-between">
          <span className="micro opacity-60">Paid by Aman</span>
          <Amount amount={60000} currency="INR" size="xl" />
        </div>
      </Card>

      <div className="mt-8">
        <Label>Surface · no dog-ear</Label>
        <Card>
          <p className="micro text-ink-faded">Overall balance</p>
          <Amount amount={892025} currency="INR" size="xl" sign="owed" className="mt-3" />
        </Card>
      </div>

      <div className="mt-8">
        <Label>Stacked · group cards</Label>
        <CardStack>
          {GROUPS.map((g) => (
            <GroupCard key={g.name} {...g} />
          ))}
        </CardStack>
      </div>
    </Section>
  );
}

function GroupCard({ name, emoji, color, date, members, balance, currency }: (typeof GROUPS)[number]) {
  const settled = balance === 0;
  const owe = balance < 0;
  return (
    <Card color={color} dogEar>
      <div className="flex items-start justify-between">
        <div style={{ "--avatar-ring": `var(--${color})` } as React.CSSProperties}>
          <AvatarStack people={PEOPLE.slice(0, members)} size="sm" max={3} />
        </div>
        <span className="micro mr-6 opacity-60">{date}</span>
      </div>
      <h3 className="mt-5 flex items-center gap-2 font-display-alt text-[38px] uppercase leading-[0.9]">
        <span aria-hidden className="text-[28px]">
          {emoji}
        </span>
        {name}
      </h3>
      <div className="mt-4 flex items-end justify-between">
        <span className="micro opacity-60">
          {settled ? "All settled" : owe ? "You owe" : "You're owed"}
        </span>
        <Amount amount={Math.abs(balance)} currency={currency} size="lg" />
      </div>
    </Card>
  );
}

function SplitBarSection() {
  const [shuffled, setShuffled] = useState(false);
  const three = [
    { name: "Vansh", color: "pink", value: shuffled ? 50000 : 120000 },
    { name: "Aman", color: "sky", value: 80000 },
    { name: "Rahul", color: "mint", value: shuffled ? 160000 : 40000 },
  ];
  const five = [
    { name: "Vansh", color: "pink", value: 3334 },
    { name: "Aman", color: "sky", value: 3333 },
    { name: "Rahul", color: "mint", value: shuffled ? 9000 : 3333 },
    { name: "Priya", color: "butter", value: 6000 },
    { name: "Kabir", color: "lilac", value: shuffled ? 1500 : 4000 },
  ];

  return (
    <Section n={4} title="Split bar">
      <Card color="lilac">
        <div className="flex items-end justify-between">
          <p className="micro opacity-60">Dinner · 3 people</p>
          <Amount amount={240000} currency="INR" size="md" />
        </div>
        <SplitBar segments={three} className="mt-4" />
      </Card>
      <div className="mt-4">
        <Card>
          <p className="micro mb-4 text-ink-faded">Hotel · 5 people</p>
          <SplitBar segments={five} />
        </Card>
      </div>
      <Button variant="secondary" className="mt-4" onClick={() => setShuffled((s) => !s)}>
        Change shares
      </Button>
    </Section>
  );
}

function AvatarsSection() {
  return (
    <Section n={5} title="Avatars">
      <Label>Sizes</Label>
      <div className="flex items-center gap-3">
        <Avatar name="Vansh Gupta" color="pink" size="sm" />
        <Avatar name="Aman Rao" color="sky" size="md" />
        <Avatar name="Rahul Mehta" color="mint" size="lg" />
      </div>

      <div className="mt-6">
        <Label>Pastels</Label>
        <div className="flex flex-wrap gap-2">
          {PASTELS.map((c, i) => (
            <Avatar key={c} name={PEOPLE[i].name} color={c} size="lg" />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <Label>Ghost members</Label>
        <div className="flex items-center gap-3">
          <Avatar name="Zoya Khan" ghost size="sm" />
          <Avatar name="Zoya Khan" ghost size="md" />
          <Avatar name="Zoya Khan" ghost size="lg" />
        </div>
      </div>

      <div className="mt-6">
        <Label>Stack · +N</Label>
        <div className="space-y-3">
          <AvatarStack people={PEOPLE.slice(0, 3)} size="lg" />
          <AvatarStack people={PEOPLE} size="md" max={4} />
          <AvatarStack people={PEOPLE} size="sm" max={5} />
        </div>
      </div>
    </Section>
  );
}

function ButtonsSection() {
  const [on, setOn] = useState(true);
  return (
    <Section n={6} title="Buttons">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Add expense</Button>
        <Button variant="secondary">Share link</Button>
        <Button variant="ghost">Cancel</Button>
        <Button disabled>Disabled</Button>
      </div>
      <Button fullWidth className="mt-3">
        Continue
      </Button>

      <div className="mt-8">
        <Label>Switch</Label>
        <div className="flex items-center gap-4">
          <Switch label="Demo switch" checked={on} onChange={setOn} />
          <Switch label="Demo switch off" checked={!on} onChange={(v) => setOn(!v)} />
          <Switch label="Disabled switch" checked={false} onChange={() => {}} disabled />
        </div>
      </div>

      <div className="mt-8">
        <Label>Settle footer</Label>
        <div className="overflow-hidden rounded-card border-[1.5px] border-ink/[0.08]">
          <div className="bg-pink px-5 pb-10 pt-5 text-on-pastel">
            <p className="micro opacity-60">Goa trip · you owe</p>
            <Amount amount={340050} currency="INR" size="xl" className="mt-2" />
          </div>
          <Button variant="footer" className="-mt-6">
            Settle up
          </Button>
        </div>
      </div>
    </Section>
  );
}

function SheetSection() {
  const [open, setOpen] = useState(false);
  return (
    <Section n={7} title="Sheet">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Expense">
        <Title line1="DINNER" line2="AT THALASSA" size="md" as="h3" />
        <Amount amount={480000} currency="INR" size="xl" className="mt-6" />
        <p className="micro mt-2 text-ink-faded">Paid by Aman · 28 Sep</p>
        <SplitBar
          className="mt-6"
          segments={[
            { name: "Vansh", color: "pink", value: 160000 },
            { name: "Aman", color: "sky", value: 160000 },
            { name: "Rahul", color: "mint", value: 160000 },
          ]}
        />
        <div className="mt-8 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button className="flex-1">Edit</Button>
        </div>
        <p className="micro mt-6 text-center text-ink-faded">Drag down or press Esc to dismiss</p>
      </Sheet>
    </Section>
  );
}

function NumpadSection() {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>("INR");
  const [value, setValue] = useState<bigint>(BigInt(0));
  const reduce = useReducedMotion();

  return (
    <Section n={8} title="Numpad">
      <div className="flex flex-wrap gap-2">
        {CURRENCY_CODES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            aria-pressed={currency === c}
            className={
              currency === c
                ? "micro h-9 rounded-full bg-ink px-4 text-bg"
                : "micro h-9 rounded-full border-[1.5px] border-ink/15 px-4"
            }
          >
            {c}
          </button>
        ))}
      </div>
      <Card className="mt-4">
        <p className="micro text-ink-faded">Last entered · minor units</p>
        <div className="mt-3 flex items-end justify-between">
          <Amount amount={value} currency={currency} size="xl" />
          <span className="font-num text-[20px] text-ink-faded">{value.toString()}</span>
        </div>
      </Card>
      <Button fullWidth className="mt-4" onClick={() => setOpen(true)}>
        Enter amount
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Enter amount"
            className="fixed inset-0 z-50 flex justify-center bg-bg pt-[env(safe-area-inset-top)]"
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={reduce ? fade : spring}
          >
            <div className="flex h-full w-full max-w-app flex-col">
              <div className="flex justify-end px-3 pt-3">
                <Button variant="ghost" aria-label="Close" onClick={() => setOpen(false)}>
                  <X className="size-6" />
                </Button>
              </div>
              <Numpad
                key={currency}
                currency={currency}
                initialMinor={value}
                label={`Dinner · ${currency}`}
                doneLabel="Save"
                onDone={(minor) => {
                  setValue(minor);
                  setOpen(false);
                }}
                className="flex-1"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}

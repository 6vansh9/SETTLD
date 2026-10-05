import { describe, expect, it } from "vitest";
import { evaluateDraft } from "./expense-form";
import { canSaveParsed, categoryFor, matchMember, parseAmountToken, parseCommand, parsedToDraft, type ParseContext, type ParseGroup } from "./parser";

const goa: ParseGroup = {
  id: "goa",
  name: "Goa Trip",
  currency: "INR",
  members: [
    { id: "me", name: "Vansh Gupta", isMe: true },
    { id: "aman", name: "Aman Rao" },
    { id: "rahul", name: "Rahul Mehta", nickname: "Rocky" },
    { id: "priya", name: "Priya Shah" },
  ],
  recent: ["rahul", "priya", "aman"],
};
const flat: ParseGroup = {
  id: "flat",
  name: "Flat 4B",
  currency: "INR",
  members: [
    { id: "me2", name: "Vansh Gupta", isMe: true },
    { id: "arjun", name: "Arjun Nair" },
    { id: "ankit", name: "Ankit Jain" },
  ],
};
const nyc: ParseGroup = { id: "nyc", name: "NYC 2026", currency: "USD", members: [{ id: "me3", name: "Vansh", isMe: true }, { id: "sam", name: "Sam Lee" }] };
const goaFood: ParseGroup = { id: "goafood", name: "Goa Foodies", currency: "INR", members: [{ id: "me4", name: "Vansh", isMe: true }] };

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({ groups: [goa, flat, nyc], currentGroupId: "goa", ...over });
const p = (text: string, over: Partial<ParseContext> = {}) => parseCommand(text, ctx(over));
const blocking = (text: string, over: Partial<ParseContext> = {}) => p(text, over).issues.filter((i) => i.blocking);

describe("PRD grammar table", () => {
  it("dinner 2400 → Dinner, ₹2,400, paid by me, whole group", () => {
    const r = p("dinner 2400");
    expect(r).toMatchObject({ title: "Dinner", amount: 240000, currency: "INR", payerId: "me", category: "food", groupId: "goa" });
    expect(r.split).toEqual({ kind: "everyone", memberIds: ["me", "aman", "rahul", "priya"] });
    expect(canSaveParsed(r)).toBe(true);
  });

  it("dinner 2400 me aman rahul → equal between the three", () => {
    expect(p("dinner 2400 me aman rahul").split).toEqual({ kind: "equal", memberIds: ["me", "aman", "rahul"] });
  });

  it("cab 600 paid by rahul → Rahul paid, whole group", () => {
    const r = p("cab 600 paid by rahul");
    expect(r).toMatchObject({ title: "Cab", amount: 60000, payerId: "rahul", category: "travel" });
    expect(r.split.kind).toBe("everyone");
  });

  it("hotel $120 split 3 → USD, me + 2 most recent, asks to confirm", () => {
    const r = p("hotel $120 split 3");
    expect(r).toMatchObject({ title: "Hotel", amount: 12000, currency: "USD", currencyExplicit: true, category: "stay", needsConfirm: true });
    expect(r.split).toEqual({ kind: "first-n", count: 3, memberIds: ["me", "rahul", "priya"] });
  });

  it("snacks 300 aman 200 me 100 → exact split", () => {
    const r = p("snacks 300 aman 200 me 100");
    expect(r.split).toEqual({ kind: "exact", parts: [{ memberId: "aman", amount: 20000 }, { memberId: "me", amount: 10000 }] });
    expect(canSaveParsed(r)).toBe(true);
  });

  it("in goa trip → picks the group by fuzzy name", () => {
    const r = p("dinner 2400 in goa trip", { currentGroupId: "flat" });
    expect(r).toMatchObject({ groupId: "goa", groupFromText: true, title: "Dinner" });
    const alone = p("in goa trip", { currentGroupId: null });
    expect(alone.groupId).toBe("goa");
    expect(alone.issues.map((i) => i.field)).toEqual(expect.arrayContaining(["amount", "title"]));
  });
});

describe("amounts", () => {
  it.each([
    ["2400", 240000, null],
    ["₹2400", 240000, "INR"],
    ["₹2,400", 240000, "INR"],
    ["1,24,000", 12400000, null],
    ["2400.50", 240050, null],
    ["2400.5", 240050, null],
    ["2.5k", 250000, null],
    ["2k", 200000, null],
    ["$120", 12000, "USD"],
    ["$12.99", 1299, "USD"],
    ["A$40", 4000, "AUD"],
    ["€15", 1500, "EUR"],
    ["£9.5", 950, "GBP"],
    ["300usd", 30000, "USD"],
    ["rs500", 50000, "INR"],
  ] as const)("%s", (tok, minor, cur) => {
    expect(parseAmountToken(tok)).toEqual({ minor, currency: cur });
  });

  it.each(["", "abc", "12.345", "$", "0", "$0", "₹$5", "1.2.3", "99999999999999999"])("rejects %j", (tok) => {
    expect(parseAmountToken(tok)).toBeNull();
  });

  it("currency codes as separate words, before or after", () => {
    expect(p("hotel 120 usd")).toMatchObject({ amount: 12000, currency: "USD" });
    expect(p("hotel usd 120")).toMatchObject({ amount: 12000, currency: "USD" });
    expect(p("tickets 40 eur")).toMatchObject({ currency: "EUR", category: "entertainment" });
    expect(p("dinner rs 2400")).toMatchObject({ amount: 240000, currency: "INR" });
  });

  it("no symbol = the group's currency", () => {
    expect(p("pizza 30", { currentGroupId: "nyc" })).toMatchObject({ amount: 3000, currency: "USD", currencyExplicit: false });
  });

  it("k shorthand in a sentence", () => {
    expect(p("rent 25k")).toMatchObject({ amount: 2500000, category: "rent" });
  });
});

describe("names", () => {
  it("first name, nickname, full name, initials, typos, case", () => {
    expect(matchMember("aman", goa.members)).toEqual({ kind: "one", id: "aman" });
    expect(matchMember("Rocky", goa.members)).toEqual({ kind: "one", id: "rahul" });
    expect(matchMember("rahulmehta", goa.members)).toEqual({ kind: "one", id: "rahul" });
    expect(matchMember("ps", goa.members)).toEqual({ kind: "one", id: "priya" });
    expect(matchMember("priyaa", goa.members)).toEqual({ kind: "one", id: "priya" });
    expect(matchMember("AMAN", goa.members)).toEqual({ kind: "one", id: "aman" });
    expect(matchMember("ra", goa.members)).toEqual({ kind: "one", id: "rahul" });
  });

  it("me / I / myself", () => {
    for (const w of ["me", "I", "myself"]) expect(matchMember(w, goa.members)).toEqual({ kind: "one", id: "me" });
  });

  it("ambiguous names return candidates instead of guessing", () => {
    // "an" = Arjun Nair's initials AND the start of Ankit: ask, don't guess
    const an = p("chai 100 an", { currentGroupId: "flat" });
    expect(an.issues.find((i) => i.token === "an")?.candidates?.map((c) => c.id).sort()).toEqual(["ankit", "arjun"]);
    expect(canSaveParsed(an)).toBe(false);
    // "ank" only fits Ankit: resolved without asking
    expect(p("chai 100 ank", { currentGroupId: "flat" }).split).toEqual({ kind: "equal", memberIds: ["ankit"] });
    // "a" is too short to guess: flagged with everyone as candidates
    const amb = p("chai 100 a", { currentGroupId: "flat" });
    expect(amb.issues.find((i) => i.token === "a")?.candidates).toHaveLength(3);
    const both = p("rent 20000 paid by an", { currentGroupId: "flat" });
    expect(both.payerId).toBeNull();
    expect(both.issues[0]).toMatchObject({ field: "payer", token: "an" });
    expect(both.issues[0].candidates!.map((c) => c.id).sort()).toEqual(["arjun", "ankit"].sort());
  });

  it("unknown names after the amount are flagged, with everyone as candidates", () => {
    const r = p("dinner 2400 me zoya");
    expect(r.issues[0]).toMatchObject({ field: "split", token: "zoya", blocking: true });
    expect(r.issues[0].candidates).toHaveLength(4);
    expect(canSaveParsed(r)).toBe(false);
  });

  it("a fix from the picker resolves the token on the next parse", () => {
    const r = p("dinner 2400 me zoya", { resolved: { zoya: "priya" } });
    expect(r.split).toEqual({ kind: "equal", memberIds: ["me", "priya"] });
    expect(canSaveParsed(r)).toBe(true);
  });

  it("paid by me / paid by initials", () => {
    expect(p("lunch 500 paid by me").payerId).toBe("me");
    expect(p("lunch 500 paid by am").payerId).toBe("aman");
  });

  it("filler words are ignored", () => {
    expect(p("dinner 2400 with aman and rahul").split).toEqual({ kind: "equal", memberIds: ["aman", "rahul"] });
    expect(p("dinner 2400 split with aman rahul").split).toEqual({ kind: "equal", memberIds: ["aman", "rahul"] });
  });

  it("the same person twice counts once", () => {
    expect(p("dinner 2400 aman aman").split).toEqual({ kind: "equal", memberIds: ["aman"] });
  });
});

describe("titles and categories", () => {
  it("multi-word titles keep their words and casing", () => {
    expect(p("Dinner at Thalassa 2400").title).toBe("Dinner at Thalassa");
  });

  it("title can come after the amount", () => {
    expect(p("2400 dinner")).toMatchObject({ title: "Dinner", amount: 240000, category: "food" });
  });

  it.each([
    ["uber", "travel"],
    ["petrol", "travel"],
    ["airbnb", "stay"],
    ["blinkit", "groceries"],
    ["wifi", "utilities"],
    ["netflix", "subscriptions"],
    ["movie", "entertainment"],
    ["amazon", "shopping"],
    ["biryani", "food"],
    ["random", "other"],
  ] as const)("%s → %s", (word, cat) => {
    expect(categoryFor([word])).toBe(cat);
  });

  it("missing title is flagged", () => {
    expect(blocking("2400").map((i) => i.field)).toContain("title");
  });
});

describe("split n", () => {
  it("split 2 = me + most recent", () => {
    expect(p("cab 300 split 2").split).toEqual({ kind: "first-n", count: 2, memberIds: ["me", "rahul"] });
  });

  it("split 4 ways = everyone (still asks)", () => {
    const r = p("dinner 2400 split 4 ways");
    expect(r.split).toMatchObject({ kind: "first-n", count: 4 });
    expect(r.needsConfirm).toBe(true);
  });

  it("more people than the group has", () => {
    expect(blocking("dinner 2400 split 9").map((i) => i.field)).toContain("split");
  });
});

describe("exact splits", () => {
  it("must add up to the total", () => {
    const r = p("snacks 300 aman 200 me 50");
    expect(r.issues.find((i) => i.field === "split")?.message).toBe("Shares add up to ₹250, not ₹300.");
  });

  it("all or nobody gets an amount", () => {
    expect(blocking("snacks 300 aman 200 me").map((i) => i.field)).toContain("split");
  });

  it("a stray amount with no name is flagged", () => {
    expect(blocking("snacks 300 200").length).toBeGreaterThan(0);
  });

  it("decimals in exact shares", () => {
    const r = p("cab 100.50 aman 50.25 me 50.25");
    expect(r.split).toEqual({ kind: "exact", parts: [{ memberId: "aman", amount: 5025 }, { memberId: "me", amount: 5025 }] });
    expect(canSaveParsed(r)).toBe(true);
  });
});

describe("groups", () => {
  it("fuzzy and partial group names", () => {
    expect(p("cab 300 in flat", { currentGroupId: "goa" }).groupId).toBe("flat");
    expect(p("cab 300 in flat 4b").groupId).toBe("flat");
    expect(p("pizza 20 in nyc").groupId).toBe("nyc");
    expect(p("pizza 20 in goa trp").groupId).toBe("goa");
  });

  it("names are matched in the chosen group", () => {
    const r = p("rent 20000 arjun ankit in flat", { currentGroupId: "goa" });
    expect(r.split).toEqual({ kind: "equal", memberIds: ["arjun", "ankit"] });
  });

  it("ambiguous group returns candidates", () => {
    const r = parseCommand("cab 300 in goa", { groups: [goa, goaFood], currentGroupId: null });
    expect(r.issues[0]).toMatchObject({ field: "group", blocking: true });
    expect(r.issues[0].candidates!.map((c) => c.id).sort()).toEqual(["goa", "goafood"]);
  });

  it("'in' that isn't a group stays in the title", () => {
    expect(p("drinks in town 500").title).toBe("Drinks in town");
  });

  it("no current group and none in the text", () => {
    expect(blocking("dinner 2400", { currentGroupId: null }).map((i) => i.field)).toContain("group");
  });
});

describe("never throws", () => {
  it.each(["", " ", "????", "💸💸💸", "a".repeat(5000), "paid by", "split", "in", "in in in", "$", "1,,,2", "dinner -400", "split 0", "paid by paid by", "\u0000\u0001"])(
    "%j",
    (text) => {
      expect(() => p(text)).not.toThrow();
      expect(p(text).issues.length).toBeGreaterThanOrEqual(0);
    },
  );

  it("negative amounts are not amounts", () => {
    expect(p("dinner -400").amount).toBeNull();
  });
});

describe("parsedToDraft → evaluateDraft (what Enter actually saves)", () => {
  it("equal split", () => {
    const r = p("dinner 2400 me aman rahul");
    const d = parsedToDraft(r, goa, "2026-10-05");
    const e = evaluateDraft(d, goa.members.map((m) => m.id), "INR");
    expect(e.canSave).toBe(true);
    expect(e.splits!.map((s) => [s.memberId, s.amount])).toEqual([["me", 80000], ["aman", 80000], ["rahul", 80000]]);
    expect(e.payers).toEqual([{ memberId: "me", amount: 240000 }]);
  });

  it("exact split", () => {
    const d = parsedToDraft(p("snacks 300 aman 200 me 100"), goa, "2026-10-05");
    const e = evaluateDraft(d, goa.members.map((m) => m.id), "INR");
    expect(e.canSave).toBe(true);
    expect(e.splits!.map((s) => [s.memberId, s.amount]).sort()).toEqual([["aman", 20000], ["me", 10000]].sort());
  });

  it("foreign currency waits for a rate", () => {
    const d = parsedToDraft(p("hotel $120 split 3"), goa, "2026-10-05");
    expect(d).toMatchObject({ currency: "USD", rate: "", amount: 12000 });
    expect(evaluateDraft(d, goa.members.map((m) => m.id), "INR").errors.rate).toBeTruthy();
    expect(evaluateDraft({ ...d, rate: "96.32" }, goa.members.map((m) => m.id), "INR").canSave).toBe(true);
  });

  it("paid by someone else", () => {
    expect(parsedToDraft(p("cab 600 paid by rahul"), goa).payerId).toBe("rahul");
  });
});

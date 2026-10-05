"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Trash2 } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { microDate } from "@/lib/groups";
import { memberAvatar, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import { spring } from "@/lib/motion";
import { newClientId, useAddComment, useDeleteComment, useMarkSeen, useSocial, useToggleReaction } from "@/lib/queries/social";
import { COMMENT_MAX, commentsFor, EMPTY_SOCIAL, reactionSummary, socialKey, unseenItems, type SocialData } from "@/lib/social";
import type { SocialEntity } from "@/lib/supabase/types";

interface SocialValue {
  groupId: string;
  myMemberId: string;
  data: SocialData;
  unseen: Set<string>;
  members: Map<string, MemberWithProfile>;
  readOnly: boolean;
}

const SocialContext = createContext<SocialValue | null>(null);

/** Reactions, comments and "new" dots for one group (PRD › Reactions and comments). */
export function GroupSocialProvider({ group, myMemberId, children }: { group: GroupWithMembers; myMemberId: string; children: React.ReactNode }) {
  const { data = EMPTY_SOCIAL } = useSocial(group.id);
  const value = useMemo<SocialValue>(
    () => ({
      groupId: group.id,
      myMemberId,
      data,
      unseen: unseenItems(data, myMemberId),
      members: new Map(group.members.map((m) => [m.id, m])),
      readOnly: !!group.archived_at,
    }),
    [group.id, group.members, group.archived_at, myMemberId, data],
  );
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

function useSocialContext() {
  return useContext(SocialContext);
}

/** The small "something new here" dot on expense and payment cards. */
export function NewDot({ type, id, className }: { type: SocialEntity; id: string; className?: string }) {
  const s = useSocialContext();
  if (!s?.unseen.has(socialKey(type, id))) return null;
  return <span role="img" aria-label="New comments or reactions" className={cn("size-2.5 shrink-0 rounded-full bg-coral ring-2 ring-surface", className)} />;
}

/** Clears the dot while the item is open (and again when something new arrives while it's open). */
export function useMarkOpenSeen(type: SocialEntity, id: string | null) {
  const s = useSocialContext();
  const mark = useMarkSeen(s?.groupId ?? "", s?.myMemberId ?? "");
  const unseen = !!(s && id && s.unseen.has(socialKey(type, id)));
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!s || !id) return;
    if (opened.current !== id || unseen) {
      opened.current = id;
      mark.mutate({ type, id });
    }
    // mark is stable enough; re-run on item change or new activity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unseen]);
}

/** Six fixed reactions; one per person; tap again to remove. Counts and who reacted. */
export function ReactionsRow({ type, id }: { type: SocialEntity; id: string }) {
  const s = useSocialContext();
  const reduce = useReducedMotion();
  const toggle = useToggleReaction(s?.groupId ?? "", s?.myMemberId ?? "");
  if (!s) return null;
  const sum = reactionSummary(s.data, type, id, s.myMemberId);
  const name = (mid: string) => (mid === s.myMemberId ? "You" : (s.members.get(mid)?.display_name.split(" ")[0] ?? "Someone"));
  const who = sum.groups.filter((g) => g.members.length > 0);

  return (
    <section className="mt-6" aria-label="Reactions">
      <div className="flex flex-wrap gap-2">
        {sum.groups.map((g) => {
          const mine = sum.mine === g.emoji;
          return (
            <motion.button
              key={g.emoji}
              type="button"
              disabled={s.readOnly}
              aria-pressed={mine}
              aria-label={`${g.emoji} ${g.members.length ? `${g.members.length}` : ""}${mine ? ", yours" : ""}`}
              whileTap={reduce ? undefined : { scale: 0.85 }}
              transition={spring}
              onClick={() => toggle.mutate({ type, id, emoji: g.emoji })}
              className={cn(
                "flex h-10 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[18px] leading-none disabled:opacity-50",
                mine ? "border-ink bg-ink/[0.06]" : "border-ink/10",
              )}
            >
              <motion.span key={`${g.emoji}-${mine}`} initial={reduce || !mine ? false : { scale: 1.5 }} animate={{ scale: 1 }} transition={spring}>
                {g.emoji}
              </motion.span>
              {g.members.length > 0 && <span className="font-num text-[18px] leading-none">{g.members.length}</span>}
            </motion.button>
          );
        })}
      </div>
      {who.length > 0 && (
        <p className="mt-2 text-[13px] font-medium text-ink/60">
          {who.map((g, i) => (
            <span key={g.emoji}>
              {i > 0 && " · "}
              {g.emoji} {g.members.map(name).join(", ")}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/** Comment thread: newest at the bottom, author photo/initials, 280 characters, live. */
export function CommentThread({ type, id }: { type: SocialEntity; id: string }) {
  const s = useSocialContext();
  const reduce = useReducedMotion();
  const add = useAddComment(s?.groupId ?? "", s?.myMemberId ?? "");
  const del = useDeleteComment(s?.groupId ?? "");
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  if (!s) return null;
  const comments = commentsFor(s.data, type, id);
  const left = COMMENT_MAX - [...text].length;

  const send = () => {
    const body = text.trim();
    if (!body || left < 0) return;
    add.mutate({ type, id, body, clientId: newClientId() });
    setText("");
    input.current?.focus();
  };

  return (
    <section className="mt-8" aria-labelledby={`comments-${id}`}>
      <h3 id={`comments-${id}`} className="micro mb-3 text-ink-faded">
        Comments{comments.length ? ` · ${comments.length}` : ""}
      </h3>
      {comments.length === 0 ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-ink/10 px-4 py-5 text-center">
          <p aria-hidden className="font-display text-[44px] uppercase leading-[0.85] text-ink-faded">
            No
            <br />
            comments
          </p>
          {!s.readOnly && (
            <button type="button" onClick={() => input.current?.focus()} className="mt-3 text-[14px] font-semibold text-ink/70 underline underline-offset-4">
              Say something
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {comments.map((c) => {
              const m = s.members.get(c.member_id);
              const mine = c.member_id === s.myMemberId;
              return (
                <motion.li
                  key={c.client_id ?? c.id}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: c.id.startsWith("temp-") ? 0.6 : 1, y: 0 }}
                  transition={reduce ? { duration: 0.15 } : spring}
                  className="flex items-start gap-3"
                >
                  {m ? <Avatar {...memberAvatar(m)} size="sm" /> : <Avatar name="?" size="sm" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="text-[14px] font-semibold">{mine ? "You" : (m?.display_name.split(" ")[0] ?? "Someone")}</span>
                      <span className="micro text-ink-faded">{microDate(c.created_at)}</span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] font-medium text-ink/85">{c.body}</p>
                  </div>
                  {mine && !c.id.startsWith("temp-") && !s.readOnly && (
                    <button
                      type="button"
                      onClick={() => del.mutate(c.id)}
                      aria-label="Delete your comment"
                      className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink/60 hover:bg-ink/5"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {!s.readOnly && (
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="relative flex-1">
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={COMMENT_MAX + 20}
              placeholder="Add a comment"
              aria-label="Add a comment"
              className="block max-h-32 min-h-12 w-full resize-none rounded-2xl border-[1.5px] border-ink/15 bg-surface px-4 py-3 pr-12 text-[16px] font-medium outline-none focus:border-ink"
            />
            {left <= 40 && (
              <span className={cn("absolute bottom-3.5 right-3 font-num text-[16px] leading-none", left < 0 ? "text-owe-ink" : "text-ink/60")}>{left}</span>
            )}
          </div>
          <button
            type="submit"
            disabled={!text.trim() || left < 0}
            onPointerDown={(e) => e.preventDefault()}
            aria-label="Send comment"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-coral text-on-pastel disabled:opacity-40"
          >
            <ArrowUp className="size-5" strokeWidth={2.5} />
          </button>
        </form>
      )}
    </section>
  );
}

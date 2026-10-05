/**
 * Database types, in the shape `supabase gen types typescript` produces.
 * Keep in sync with supabase/migrations/. Regenerate once the CLI is linked.
 */
import type { CurrencyCode } from "@/lib/money";
import type { Category } from "@/lib/categories";
import type { SplitType } from "@/lib/money";
import type { Pastel } from "@/lib/pastels";

export type GroupType = "trip" | "home" | "couple" | "other";
export type SettlementMethod = "upi" | "cash" | "other";
export type SettlementStatus = "pending" | "confirmed" | "disputed";
export type MemberRole = "admin" | "member";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          avatar_color: Pastel;
          upi_id: string | null;
          upi_opt_out: boolean;
          default_currency: CurrencyCode;
          privacy_blur: boolean;
          onboarded_at: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          avatar_color?: Pastel;
          upi_id?: string | null;
          upi_opt_out?: boolean;
          default_currency?: CurrencyCode;
          privacy_blur?: boolean;
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          avatar_color?: Pastel;
          upi_id?: string | null;
          upi_opt_out?: boolean;
          default_currency?: CurrencyCode;
          privacy_blur?: boolean;
          onboarded_at?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          emoji: string;
          color: Pastel;
          base_currency: CurrencyCode;
          type: GroupType;
          simplify: boolean;
          cover_url: string | null;
          nudge_mode: NudgeMode;
          created_by: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string | null;
          display_name: string;
          is_ghost: boolean;
          role: MemberRole;
          joined_at: string;
          left_at: string | null;
          notify_level: NotifyLevel;
          added_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          id: string;
          group_id: string;
          token: string;
          created_by: string | null;
          revoked_at: string | null;
          ghost_member_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "invites_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_ghost_member_id_fkey";
            columns: ["ghost_member_id"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          amount: number;
          currency: CurrencyCode;
          fx_rate_to_base: number;
          amount_base: number;
          category: Category;
          date: string;
          note: string | null;
          created_by: string | null;
          client_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "expenses_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_payers: {
        Row: { expense_id: string; member_id: string; amount_base: number };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "expense_payers_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_payers_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_splits: {
        Row: { expense_id: string; member_id: string; amount_base: number; split_type: SplitType; raw_value: number | null };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_splits_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          id: string;
          group_id: string;
          from_member: string;
          to_member: string;
          amount: number;
          currency: CurrencyCode;
          amount_base: number;
          method: SettlementMethod;
          status: SettlementStatus;
          client_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      fx_rates: {
        Row: { base: CurrencyCode; quote: CurrencyCode; rate: string; fetched_at: string };
        Insert: { base: CurrencyCode; quote: CurrencyCode; rate: string; fetched_at?: string };
        Update: { rate?: string; fetched_at?: string };
        Relationships: [];
      };
      activity: {
        Row: {
          id: string;
          group_id: string;
          actor_member: string | null;
          kind: string;
          entity_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "activity_actor_member_fkey";
            columns: ["actor_member"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      split_rooms: {
        Row: {
          id: string;
          code: string;
          group_id: string;
          name: string;
          host_member: string;
          tax_kind: ChargeKind;
          tax_value: number;
          service_kind: ChargeKind;
          service_value: number;
          tip_kind: ChargeKind;
          tip_value: number;
          status: RoomStatus;
          paid_by: string | null;
          expense_id: string | null;
          created_at: string;
          expires_at: string;
          closed_at: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      split_room_items: {
        Row: {
          id: string;
          room_id: string;
          name: string;
          price: number;
          qty: number;
          position: number;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      split_room_claims: {
        Row: { room_id: string; item_id: string; member_id: string; shares: number; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_phones: {
        Row: { user_id: string; phone: string; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ghost_phones: {
        Row: { member_id: string; group_id: string; phone: string; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      reactions: {
        Row: { id: string; group_id: string; entity_type: SocialEntity; entity_id: string; member_id: string; emoji: ReactionEmoji | null; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      comments: {
        Row: { id: string; group_id: string; entity_type: SocialEntity; entity_id: string; member_id: string; body: string; client_id: string | null; created_at: string; deleted_at: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      entity_seen: {
        Row: { member_id: string; group_id: string; entity_type: SocialEntity; entity_id: string; seen_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      nudges: {
        Row: { id: string; group_id: string; from_member: string; to_member: string; level: number; amount: number; days: number; template: number; sent_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      push_subscriptions: {
        Row: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: string; last_used_at: string | null };
        Insert: never;
        Update: { last_used_at?: string | null };
        Relationships: [];
      };
    };
    Views: {
      group_balances: {
        Row: {
          group_id: string;
          member_id: string;
          paid: number;
          owed: number;
          settlements_sent: number;
          settlements_received: number;
          net: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_group: {
        Args: { p_name: string; p_emoji: string; p_color: Pastel; p_base_currency: CurrencyCode; p_type: GroupType };
        Returns: string;
      };
      preview_invite: {
        Args: { p_token: string };
        Returns: { name: string; emoji: string; color: Pastel; member_count: number; cover_url: string | null }[];
      };
      invite_details: {
        Args: { p_token: string };
        Returns: InviteDetails | null;
      };
      join_group: { Args: { p_token: string }; Returns: string };
      claim_ghost: { Args: { p_token: string; p_member_id: string }; Returns: string };
      regenerate_invite: { Args: { p_group_id: string }; Returns: string };
      ghost_claim_link: { Args: { p_member_id: string }; Returns: string };
      add_ghost: { Args: { p_group_id: string; p_name: string; p_phone?: string | null }; Returns: string };
      set_my_phone: { Args: { p_phone: string | null }; Returns: undefined };
      set_ghost_phone: { Args: { p_member_id: string; p_phone: string | null }; Returns: undefined };
      claim_link_phone: { Args: { p_token: string }; Returns: string | null };
      remove_member: { Args: { p_member_id: string }; Returns: undefined };
      update_group: {
        Args: { p_group_id: string; p_name: string; p_emoji: string; p_color: Pastel };
        Returns: undefined;
      };
      set_group_archived: { Args: { p_group_id: string; p_archived: boolean }; Returns: undefined };
      set_group_simplify: { Args: { p_group_id: string; p_simplify: boolean }; Returns: undefined };
      create_expense: {
        Args: {
          p_group_id: string;
          p_title: string;
          p_amount: number;
          p_currency: CurrencyCode;
          p_fx_rate: string;
          p_category: Category;
          p_date: string;
          p_note: string | null;
          p_split_type: SplitType;
          p_payers: Json;
          p_splits: Json;
          p_client_id: string | null;
        };
        Returns: string;
      };
      update_expense: {
        Args: {
          p_expense_id: string;
          p_title: string;
          p_amount: number;
          p_currency: CurrencyCode;
          p_fx_rate: string;
          p_category: Category;
          p_date: string;
          p_note: string | null;
          p_split_type: SplitType;
          p_payers: Json;
          p_splits: Json;
        };
        Returns: undefined;
      };
      record_settlement: {
        Args: {
          p_group_id: string;
          p_from_member: string;
          p_to_member: string;
          p_amount: number;
          p_method: SettlementMethod;
          p_client_id: string | null;
        };
        Returns: string;
      };
      confirm_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      dispute_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      update_settlement: { Args: { p_settlement_id: string; p_amount: number; p_method: SettlementMethod }; Returns: undefined };
      delete_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      restore_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      delete_expense: { Args: { p_expense_id: string }; Returns: undefined };
      restore_expense: { Args: { p_expense_id: string }; Returns: undefined };
      create_room: { Args: { p_group_id: string; p_name: string }; Returns: { id: string; code: string } };
      room_preview: { Args: { p_code: string }; Returns: RoomPreview[] };
      join_room: { Args: { p_code: string }; Returns: { room_id: string; group_id: string; code: string } };
      upsert_items: {
        Args: { p_room_id: string; p_items: Json | null; p_charges?: Json | null; p_name?: string | null };
        Returns: undefined;
      };
      toggle_claim: { Args: { p_item_id: string; p_on?: boolean | null }; Returns: number };
      set_claim_shares: { Args: { p_item_id: string; p_shares: number; p_member_id?: string | null }; Returns: undefined };
      assign_claim: { Args: { p_item_id: string; p_member_id: string; p_on?: boolean | null }; Returns: number };
      finalize_room: { Args: { p_room_id: string; p_payer?: string | null; p_client_id?: string | null }; Returns: string };
      cancel_room: { Args: { p_room_id: string }; Returns: undefined };
      set_group_cover: { Args: { p_group_id: string; p_url: string | null }; Returns: undefined };
      toggle_reaction: { Args: { p_entity_type: SocialEntity; p_entity_id: string; p_emoji: ReactionEmoji }; Returns: ReactionEmoji | null };
      add_comment: { Args: { p_entity_type: SocialEntity; p_entity_id: string; p_body: string; p_client_id?: string | null }; Returns: string };
      delete_comment: { Args: { p_comment_id: string }; Returns: undefined };
      mark_seen: { Args: { p_entity_type: SocialEntity; p_entity_id: string }; Returns: undefined };
      set_notify_level: { Args: { p_group_id: string; p_level: NotifyLevel }; Returns: undefined };
      set_nudge_mode: { Args: { p_group_id: string; p_mode: NudgeMode }; Returns: undefined };
      send_nudge: { Args: { p_to_member: string; p_amount: number; p_template: number }; Returns: Nudge };
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string | null }; Returns: undefined };
      delete_push_subscription: { Args: { p_endpoint: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type ChargeKind = "percent" | "amount";
export type SocialEntity = "expense" | "settlement";
export const REACTION_EMOJIS = ["💀", "😭", "🔥", "🙏", "🤡", "💸"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export type NotifyLevel = "all" | "money" | "off";
export type NudgeMode = "on" | "polite" | "off";
export type RoomStatus = "open" | "finalized" | "cancelled" | "expired";

/** room_preview(): basics by code (ids only for members). */
export interface RoomPreview {
  room_id: string | null;
  room_name: string;
  status: RoomStatus;
  expired: boolean;
  group_id: string | null;
  group_name: string;
  emoji: string;
  color: Pastel;
  member_count: number;
  is_member: boolean;
  host_name: string | null;
}

/** Shape of invite_details() (jsonb). */
export interface InviteDetails {
  /** Set when the caller is already a member; the Join screen redirects there. */
  member_group_id: string | null;
  ghosts: { id: string; display_name: string }[];
  /** Personal claim link: the ghost this link is for. */
  claim: { id: string; display_name: string } | null;
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type Group = Database["public"]["Tables"]["groups"]["Row"];
export type GroupMember = Database["public"]["Tables"]["group_members"]["Row"];
export type Invite = Database["public"]["Tables"]["invites"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type GroupBalance = Database["public"]["Views"]["group_balances"]["Row"];
export type Settlement = Database["public"]["Tables"]["settlements"]["Row"];
export type SplitRoom = Database["public"]["Tables"]["split_rooms"]["Row"];
export type SplitRoomItem = Database["public"]["Tables"]["split_room_items"]["Row"];
export type SplitRoomClaim = Database["public"]["Tables"]["split_room_claims"]["Row"];
export type Reaction = Database["public"]["Tables"]["reactions"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type EntitySeen = Database["public"]["Tables"]["entity_seen"]["Row"];
export type Nudge = Database["public"]["Tables"]["nudges"]["Row"];

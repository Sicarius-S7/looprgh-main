export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      counters: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          auto_reset_daily: boolean
          closes_at: string
          enforce_hours: boolean
          opens_at: string
          org_id: string
          pause_note: string
          paused: boolean
          updated_at: string
        }
        Insert: {
          auto_reset_daily?: boolean
          closes_at?: string
          enforce_hours?: boolean
          opens_at?: string
          org_id: string
          pause_note?: string
          paused?: boolean
          updated_at?: string
        }
        Update: {
          auto_reset_daily?: boolean
          closes_at?: string
          enforce_hours?: boolean
          opens_at?: string
          org_id?: string
          pause_note?: string
          paused?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          avg_service_minutes: number
          blurb: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          avg_service_minutes?: number
          blurb?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          avg_service_minutes?: number
          blurb?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          avg_minutes: number
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          avg_minutes?: number
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          avg_minutes?: number
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          access_token: string
          called_at: string | null
          closed_at: string | null
          code: string
          counter_id: string | null
          id: string
          joined_at: string
          kiosk: boolean
          name: string
          org_id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          rating: number | null
          rating_note: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          user_id: string | null
          walk_in: boolean
        }
        Insert: {
          access_token?: string
          called_at?: string | null
          closed_at?: string | null
          code: string
          counter_id?: string | null
          id?: string
          joined_at?: string
          kiosk?: boolean
          name?: string
          org_id: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          rating?: number | null
          rating_note?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          user_id?: string | null
          walk_in?: boolean
        }
        Update: {
          access_token?: string
          called_at?: string | null
          closed_at?: string | null
          code?: string
          counter_id?: string | null
          id?: string
          joined_at?: string
          kiosk?: boolean
          name?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          rating?: number | null
          rating_note?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          user_id?: string | null
          walk_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tickets_counter_id_fkey"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "counters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_org: { Args: { _org: string }; Returns: boolean }
      get_my_ticket: {
        Args: { _id: string; _token: string }
        Returns: {
          called_at: string
          closed_at: string
          code: string
          counter_id: string
          id: string
          joined_at: string
          name: string
          org_id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          rating: number
          rating_note: string
          service_id: string
          status: Database["public"]["Enums"]["ticket_status"]
        }[]
      }
      is_org_manager: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      join_queue: {
        Args: {
          _kiosk?: boolean
          _name: string
          _org: string
          _priority?: Database["public"]["Enums"]["ticket_priority"]
          _service?: string
        }
        Returns: {
          access_token: string
          code: string
          id: string
        }[]
      }
      leave_queue: { Args: { _id: string; _token: string }; Returns: boolean }
      org_is_unclaimed: { Args: { _org: string }; Returns: boolean }
      public_org_settings: {
        Args: { _org: string }
        Returns: {
          closes_at: string
          enforce_hours: boolean
          opens_at: string
          org_id: string
          pause_note: string
          paused: boolean
        }[]
      }
      queue_snapshot: {
        Args: { _org: string }
        Returns: Database["public"]["CompositeTypes"]["public_ticket"][]
        SetofOptions: {
          from: "*"
          to: "public_ticket"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rate_ticket: {
        Args: { _id: string; _note?: string; _rating: number; _token: string }
        Returns: boolean
      }
    }
    Enums: {
      org_role: "owner" | "manager" | "reception"
      ticket_priority: "none" | "elderly" | "urgent"
      ticket_status: "waiting" | "called" | "served" | "no_show" | "left"
    }
    CompositeTypes: {
      public_ticket: {
        id: string | null
        code: string | null
        org_id: string | null
        service_id: string | null
        counter_id: string | null
        priority: Database["public"]["Enums"]["ticket_priority"] | null
        status: Database["public"]["Enums"]["ticket_status"] | null
        joined_at: string | null
        called_at: string | null
        closed_at: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      org_role: ["owner", "manager", "reception"],
      ticket_priority: ["none", "elderly", "urgent"],
      ticket_status: ["waiting", "called", "served", "no_show", "left"],
    },
  },
} as const

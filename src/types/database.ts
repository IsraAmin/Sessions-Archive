export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.17' }
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string; university: string | null; department: string | null; level: string | null; bio: string | null; avatar_path: string | null; created_at: string; updated_at: string }
        Insert: { id: string; full_name: string; university?: string | null; department?: string | null; level?: string | null; bio?: string | null; avatar_path?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; full_name?: string; university?: string | null; department?: string | null; level?: string | null; bio?: string | null; avatar_path?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      categories: {
        Row: { id: string; name: string; slug: string; description: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; slug: string; description?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; slug?: string; description?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      speakers: {
        Row: { id: string; name: string; bio: string | null; organization: string | null; image_path: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; bio?: string | null; organization?: string | null; image_path?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; bio?: string | null; organization?: string | null; image_path?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      session_series: {
        Row: { id: string; title: string; description: string | null; published: boolean; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; title: string; description?: string | null; published?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; title?: string; description?: string | null; published?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      sessions: {
        Row: { id: string; title: string; slug: string; description: string; category_id: string | null; speaker_id: string | null; series_id: string | null; series_position: number | null; starts_at: string; ends_at: string | null; location: string | null; capacity: number; cover_path: string | null; status: string; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; title: string; slug: string; description: string; category_id?: string | null; speaker_id?: string | null; series_id?: string | null; series_position?: number | null; starts_at: string; ends_at?: string | null; location?: string | null; capacity?: number; cover_path?: string | null; status?: string; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; title?: string; slug?: string; description?: string; category_id?: string | null; speaker_id?: string | null; series_id?: string | null; series_position?: number | null; starts_at?: string; ends_at?: string | null; location?: string | null; capacity?: number; cover_path?: string | null; status?: string; created_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: 'sessions_category_id_fkey'; columns: ['category_id']; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ['id'] },
          { foreignKeyName: 'sessions_series_id_fkey'; columns: ['series_id']; isOneToOne: false; referencedRelation: 'session_series'; referencedColumns: ['id'] },
          { foreignKeyName: 'sessions_speaker_id_fkey'; columns: ['speaker_id']; isOneToOne: false; referencedRelation: 'speakers'; referencedColumns: ['id'] },
        ]
      }
      registrations: {
        Row: { id: string; user_id: string; session_id: string; attendance_status: string; attended_at: string | null; created_at: string }
        Insert: { id?: string; user_id: string; session_id: string; attendance_status?: string; attended_at?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; session_id?: string; attendance_status?: string; attended_at?: string | null; created_at?: string }
        Relationships: [{ foreignKeyName: 'registrations_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'sessions'; referencedColumns: ['id'] }]
      }
      bookmarks: {
        Row: { id: string; user_id: string; session_id: string; note: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; session_id: string; note?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; session_id?: string; note?: string | null; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: 'bookmarks_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'sessions'; referencedColumns: ['id'] }]
      }
      feedback: {
        Row: { id: string; user_id: string; session_id: string; rating: number; comment: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; session_id: string; rating: number; comment?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; session_id?: string; rating?: number; comment?: string | null; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: 'feedback_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'sessions'; referencedColumns: ['id'] }]
      }
      session_resources: {
        Row: { id: string; session_id: string; title: string; file_path: string; created_at: string }
        Insert: { id?: string; session_id: string; title: string; file_path: string; created_at?: string }
        Update: { id?: string; session_id?: string; title?: string; file_path?: string; created_at?: string }
        Relationships: [{ foreignKeyName: 'session_resources_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'sessions'; referencedColumns: ['id'] }]
      }
      session_videos: {
        Row: { id: string; session_id: string; title: string; youtube_video_id: string; position: number; created_at: string; updated_at: string }
        Insert: { id?: string; session_id: string; title: string; youtube_video_id: string; position?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; session_id?: string; title?: string; youtube_video_id?: string; position?: number; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: 'session_videos_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'sessions'; referencedColumns: ['id'] }]
      }
      notifications: {
        Row: { id: string; user_id: string; type: string; title_ar: string; title_en: string; body_ar: string; body_en: string; href: string | null; dedupe_key: string | null; read_at: string | null; created_at: string }
        Insert: { id?: string; user_id: string; type: string; title_ar: string; title_en: string; body_ar: string; body_en: string; href?: string | null; dedupe_key?: string | null; read_at?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; type?: string; title_ar?: string; title_en?: string; body_ar?: string; body_en?: string; href?: string | null; dedupe_key?: string | null; read_at?: string | null; created_at?: string }
        Relationships: []
      }
      notification_preferences: {
        Row: { user_id: string; push_enabled: boolean; session_reminders: boolean; session_updates: boolean; new_content: boolean; announcements: boolean; reminder_minutes: number; language: string; created_at: string; updated_at: string }
        Insert: { user_id: string; push_enabled?: boolean; session_reminders?: boolean; session_updates?: boolean; new_content?: boolean; announcements?: boolean; reminder_minutes?: number; language?: string; created_at?: string; updated_at?: string }
        Update: { user_id?: string; push_enabled?: boolean; session_reminders?: boolean; session_updates?: boolean; new_content?: boolean; announcements?: boolean; reminder_minutes?: number; language?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
      video_progress: {
        Row: { id: string; user_id: string; video_id: string; seconds: number; duration: number; percent: number; completed_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; video_id: string; seconds?: number; duration?: number; percent?: number; completed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; video_id?: string; seconds?: number; duration?: number; percent?: number; completed_at?: string | null; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: 'video_progress_video_id_fkey'; columns: ['video_id']; isOneToOne: false; referencedRelation: 'session_videos'; referencedColumns: ['id'] }]
      }
      session_views: {
        Row: { id: string; user_id: string; session_id: string; viewed_at: string }
        Insert: { id?: string; user_id: string; session_id: string; viewed_at?: string }
        Update: { id?: string; user_id?: string; session_id?: string; viewed_at?: string }
        Relationships: [{ foreignKeyName: 'session_views_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'sessions'; referencedColumns: ['id'] }]
      }
      push_subscriptions: {
        Row: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; endpoint?: string; p256dh?: string; auth?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_super_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      search_sessions: {
        Args: { search_text?: string | null; category_filter?: string | null }
        Returns: Array<{ id: string; title: string; slug: string; description: string; category_id: string | null; speaker_id: string | null; starts_at: string; ends_at: string | null; location: string | null; capacity: number; cover_path: string | null; status: string; created_at: string; category_name: string | null; speaker_name: string | null }>
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Row']

export type Category = {
  id: string
  name: string
  slug: string
  description: string | null
}

export type Speaker = {
  id: string
  name: string
  bio: string | null
  image_path: string | null
  organization: string | null
}

export type SessionStatus = 'draft' | 'published' | 'cancelled'

export type Session = {
  id: string
  title: string
  slug: string
  description: string
  category_id: string | null
  speaker_id: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  capacity: number
  cover_path: string | null
  status: SessionStatus
  created_at: string
  category?: Category | null
  speaker?: Speaker | null
}

export type SessionResource = {
  id: string
  session_id: string
  title: string
  file_path: string
  created_at: string
}

export type SessionVideo = {
  id: string
  session_id: string
  title: string
  youtube_video_id: string
  position: number
  created_at: string
  updated_at: string
}

export type Profile = {
  id: string
  full_name: string
  university: string | null
  department: string | null
  level: string | null
  bio: string | null
  avatar_path: string | null
}

export type SearchSession = Session & {
  category_name: string | null
  speaker_name: string | null
}

export type MediaKind = "image" | "video";

export type MediaItem = {
  index: number;
  kind: MediaKind;
  path: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
};

export type LineKind = "speech" | "song" | "speech_music" | "unknown";

export type TranscriptLine = {
  start: number;
  end: number;
  text: string;
  lang?: string;
  speaker?: string;
  kind?: LineKind;
};

export type Transcript = {
  mediaIndex: number;
  status: "done" | "error";
  lines: TranscriptLine[];
  // 가사·말이 없는 구간도 남기기 위한 오디오 구간 요약
  audio?: { start: number; end: number; kind: "speech" | "music" | "song" | "silence" }[];
  error?: string;
  // 영상에 오디오 트랙 자체가 없음 (오류 아님)
  noAudio?: boolean;
};

// 예전에 오류로 저장된 "오디오 트랙 없음" 도 같은 것으로 본다
export const isNoAudio = (t: Transcript) => !!t.noAudio || (t.status === "error" && /no audio stream/i.test(t.error ?? ""));

export type Attachment = {
  name: string;
  path: string;
  size: number;
  contentType: string;
  addedAt: string;
};

export type Account = {
  username: string;
  fullName: string | null;
  profileUrl: string;
  isVerified?: boolean;
  profilePicPath?: string;
};

// DB 행 그대로 (snake_case)
export type Post = {
  id: string;
  workspace_id: string;
  project_id: string;
  folder_id: string | null;
  shortcode: string;
  url: string;
  title: string;
  account: Account;
  caption: string;
  hashtags: string[];
  mentions: string[];
  taken_at: string;
  type: "image" | "video" | "carousel";
  likes: number | null;
  comments: number | null;
  views: number | null;
  music: string | null;
  location: string | null;
  media: MediaItem[];
  thumb_path: string | null;
  transcripts: Transcript[];
  attachments: Attachment[];
  note: string;
  created_at: string;
  updated_at: string;
};

export type Workspace = { id: string; name: string; created_by: string; created_at: string };

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
};

export type Folder = {
  id: string;
  workspace_id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  position: number;
};

export type Member = {
  workspace_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
  profile?: { email: string; name: string | null } | null;
};

export type Invite = {
  id: string;
  workspace_id: string;
  token: string;
  role: "owner" | "member";
  created_at: string;
  expires_at: string;
  revoked: boolean;
};

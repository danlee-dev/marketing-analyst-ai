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
};

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

export type Post = {
  id: string;
  url: string;
  title: string;
  account: Account;
  caption: string;
  hashtags: string[];
  mentions: string[];
  takenAt: string;
  type: "image" | "video" | "carousel";
  likes: number | null;
  comments: number | null;
  views: number | null;
  music?: string | null;
  location?: string | null;
  media: MediaItem[];
  thumbPath: string | null;
  transcripts: Transcript[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
};

export interface User {
  id: string;
  name: string;
  email: string;
  is_admin?: boolean;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  is_done: boolean;
  position?: number;
}

export interface Checklist {
  id: string;
  title: string;
  items?: ChecklistItem[];
  position?: number;
}

export interface Comment {
  id: string;
  body: string;
  user_id?: string;
  user_name?: string;
  created_at: string;
  card_id?: string;
  board_id?: string;
  card_title?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mime?: string;
  size: number;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  column_id?: string;
  position?: number;
  due_date?: string | null;
  cover_color?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  labelIds?: string[];
  checklists?: Checklist[];
  comments?: Comment[];
  attachments?: Attachment[];
  column_title?: string;
  board_id?: string;
  board_title?: string;
}

export interface Column {
  id: string;
  title: string;
  position?: number;
  cards?: Card[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface BoardSummary {
  id: string;
  title: string;
  description?: string;
  owner_id?: string;
}

export interface ArchivedCard {
  id: string;
  title: string;
  column_title?: string;
}

export interface BoardDetail extends BoardSummary {
  columns: Column[];
  labels?: Label[];
  members?: Member[];
  archived_cards?: ArchivedCard[];
  role?: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  actor_name?: string;
  created_at: string;
  payload?: {
    title?: string;
  };
}

export interface InviteMeta {
  board_title: string;
}

export interface InviteCreated {
  token: string;
}

export interface InviteAcceptResult {
  board_id: string;
}

export interface SearchBoardHit {
  id: string;
  title: string;
}

export interface SearchCardHit {
  id: string;
  title: string;
  board_id: string;
  board_title: string;
  column_title: string;
}

export interface SearchCommentHit {
  id: string;
  body: string;
  board_id: string;
  card_title: string;
  user_name: string;
}

export interface SearchResults {
  boards: SearchBoardHit[];
  cards: SearchCardHit[];
  comments: SearchCommentHit[];
}

export interface CardPatch {
  title?: string;
  description?: string;
  due_date?: string | null;
  cover_color?: string | null;
  assignee_id?: string | null;
  column_id?: string;
  position?: number;
}

export interface ColumnPatch {
  title?: string;
  position?: number;
}

export interface BoardPatch {
  title?: string;
  description?: string;
}

export interface LabelPatch {
  name?: string;
  color?: string;
}

export interface ChecklistPatch {
  title?: string;
  position?: number;
}

export interface ChecklistItemPatch {
  text?: string;
  is_done?: boolean;
  position?: number;
}

export interface BoardSocketEvent {
  type: string;
}

export type BrandVariant = "mark" | "wordmark" | "lockup" | "mark-navy" | "mark-white";
export type BrandSize = "sm" | "md" | "lg";
export type BoardViewMode = "kanban" | "list";
export type ListSort = "column" | "title" | "due" | "assignee";

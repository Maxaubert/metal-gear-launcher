import { z } from "zod";
import { settingsGameId } from "./settings";

export const bookRequest = z.object({
  gameId: settingsGameId,
  kind: z.enum(["master", "screenplay"]),
  language: z.enum(["en", "jp"]),
}).strict();
export const bookPageRequest = bookRequest.extend({ page: z.number().int().min(0).max(10000) }).strict();
export type BookRequest = z.infer<typeof bookRequest>;
export type BookPageRequest = z.infer<typeof bookPageRequest>;
export type BookKind = BookRequest["kind"];
export type BookLanguage = BookRequest["language"];
export interface BookEntry {
  gameId: BookRequest["gameId"];
  kind: BookKind;
  title: string;
  gameTitle: string;
  languages: BookLanguage[];
}
export interface BookDocument extends BookRequest {
  title: string;
  pageCount: number;
  lastPage: number;
  contents: { title: string; page: number }[];
}
export interface BookPage {
  page: number;
  nativePage: number;
  title: string;
  imageUrl?: string;
  artworkUrls: string[];
  columns: { id: string; markup: string }[];
}

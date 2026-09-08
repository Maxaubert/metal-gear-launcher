import { packSchema, type Pack } from "./schema";
import mg12 from "./mg12.json"; import mgs1 from "./mgs1.json"; import mgs2 from "./mgs2.json";
import mgs3 from "./mgs3.json"; import mgs4 from "./mgs4.json"; import mgspw from "./mgspw.json";
export * from "./schema";
export const PACK_ORDER = ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"] as const;
const raw: Record<string, unknown> = { mg12, mgs1, mgs2, mgs3, mgs4, mgspw };
export function loadPacks(): Pack[] {
  return PACK_ORDER.map((id) => packSchema.parse(raw[id]));
}

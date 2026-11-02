import { asc } from "drizzle-orm";
import { banco } from "../db/client";
import { departamentos } from "../db/schema";

export type Departamento = typeof departamentos.$inferSelect;

export async function listarDepartamentos(): Promise<Departamento[]> {
  return banco().select().from(departamentos).orderBy(asc(departamentos.ordem));
}

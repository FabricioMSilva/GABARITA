import type { PostgrestError } from "@supabase/supabase-js";

export function throwRepositoryError(
  operation: string,
  error: PostgrestError | null,
): void {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

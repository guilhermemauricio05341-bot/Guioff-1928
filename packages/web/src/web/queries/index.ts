import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export { orpc };

/** Wraps a mutation and invalidates all queries afterwards (data is cross-linked). */
export function useAction<TIn, TOut>(fn: (input: TIn) => Promise<TOut>, onDone?: (out: TOut) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: orpc.key() });
      onDone?.(out);
    },
    onError: (e) => alert((e as Error).message || "Algo deu errado"),
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createRecurring,
  deleteRecurring,
  updateRecurring,
} from "../api/recurringApi";
import { invalidateRecurringQueries } from "../cache/invalidateRecurringQueries";
import type { CreateRecurringBody, UpdateRecurringBody } from "../types";

export function useCreateRecurringMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRecurringBody) => createRecurring(body),
    onSuccess: () => invalidateRecurringQueries(qc),
  });
}

export function useUpdateRecurringMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRecurringBody }) =>
      updateRecurring(id, body),
    onSuccess: () => invalidateRecurringQueries(qc),
  });
}

export function useDeleteRecurringMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecurring(id),
    onSuccess: () => invalidateRecurringQueries(qc),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api/client";

type FavIds = { parlour: string[]; artist: string[] };

export function useFavIds() {
  return useQuery({
    queryKey: ["favourites", "ids"],
    queryFn: () => api<FavIds>("/api/favourites/ids"),
  });
}

export function useToggleFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: "parlour" | "artist"; item_id: string }) =>
      api<{ favourited: boolean }>("/api/favourites/toggle", {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favourites"] });
    },
  });
}

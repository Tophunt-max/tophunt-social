import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";

/**
 * appConfig for the settings cards (Coin Economy, Earning → Free Rewards),
 * plus the same per-card save App Control uses: each card posts only its own
 * keys to /admin/app-settings, which validates and audits them.
 */
export function useAppConfig() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["app-settings"], queryFn: api.appSettings });
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.saveAppSettings(patch),
    onSuccess: () => {
      toast.success("Saved — users ke app me turant live");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e) => toast.error(describeError(e)),
  });
  return { data: query.data, isLoading: query.isLoading, save };
}

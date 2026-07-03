"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api-client";
import { useMessages } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const m = useMessages();
  const mutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      router.replace("/login");
      router.refresh();
    },
  });
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {m.UI.logout}
    </Button>
  );
}

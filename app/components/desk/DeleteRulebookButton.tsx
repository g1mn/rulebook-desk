import { actionErrorMessage, useActionMutation } from "@agent-native/core/client/hooks";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { useDeskI18n } from "@/hooks/use-desk-i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeleteRulebookButton({ id, name }: { id: string; name: string }) {
  const { t } = useDeskI18n();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const remove = useActionMutation("delete-rulebook", {
    onSuccess: (result) => {
      toast.success(t("desk.delete.deleted", { name: result.name }));
      navigate("/desk");
    },
    onError: (err) => toast.error(actionErrorMessage(err) ?? t("desk.delete.failed")),
  });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t("desk.delete.label")}
        title={t("desk.delete.label")}
      >
        <IconTrash className="size-4" />
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("desk.delete.title", { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("desk.delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("desk.delete.keep")}</AlertDialogCancel>
            <AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate({ id })}>
              {remove.isPending ? t("desk.delete.deleting") : t("desk.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

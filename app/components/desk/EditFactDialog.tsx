import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDeskI18n } from "@/hooks/use-desk-i18n";
import { KIND_ORDER, kindSingular, type FactKind } from "@/lib/rulebook";

import type { Fact } from "./FactRow";

export interface FactPatch {
  label?: string;
  detail?: string | null;
  kind?: FactKind;
  quote?: string;
  dueLocal?: string | null;
  timeZone?: string;
}

/**
 * Edit an existing fact, or (with `fact` null and `draft` set) add a new one
 * by hand. Both paths go through the same actions the agent uses.
 */
export function EditFactDialog({
  fact,
  draft,
  open,
  pending,
  onOpenChange,
  onSave,
}: {
  fact: Fact | null;
  draft?: FactPatch | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: FactPatch) => void;
}) {
  const { t } = useDeskI18n();
  const creating = !fact;
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState<FactKind>("requirement");
  const [quote, setQuote] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [zone, setZone] = useState("");

  useEffect(() => {
    if (fact) {
      setLabel(fact.label);
      setDetail(fact.detail ?? "");
      setKind(fact.kind as FactKind);
      setQuote(fact.quote ?? "");
      setDueLocal(fact.dueLocal ?? "");
      setZone(fact.dueTimeZone ?? "");
    } else if (open) {
      setLabel(draft?.label ?? "");
      setDetail(draft?.detail ?? "");
      setKind(draft?.kind ?? "requirement");
      setQuote(draft?.quote ?? "");
      setDueLocal(draft?.dueLocal ?? "");
      setZone(draft?.timeZone ?? "");
    }
  }, [fact, draft, open]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (dueLocal && !zone.trim()) {
      toast.error(t("desk.edit.needZone"));
      return;
    }
    if (creating) {
      onSave({
        label: label.trim(),
        kind,
        ...(detail.trim() ? { detail: detail.trim() } : {}),
        ...(quote.trim() ? { quote: quote.trim() } : {}),
        ...(dueLocal ? { dueLocal, timeZone: zone.trim() || "UTC" } : {}),
      });
      return;
    }
    if (!fact) return;
    const patch: FactPatch = {};
    if (label.trim() !== fact.label) patch.label = label.trim();
    if ((detail.trim() || null) !== fact.detail) patch.detail = detail.trim() || null;
    if (kind !== fact.kind) patch.kind = kind;
    if (quote.trim() !== (fact.quote ?? "")) patch.quote = quote.trim();
    if (dueLocal !== (fact.dueLocal ?? "") || zone !== (fact.dueTimeZone ?? "")) {
      if (!dueLocal) patch.dueLocal = null;
      else {
        patch.dueLocal = dueLocal;
        patch.timeZone = zone || "UTC";
      }
    }
    onSave(patch);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{creating ? t("desk.edit.addTitle") : t("desk.edit.editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="f-label">{t("desk.edit.label")}</Label>
              <Input id="f-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={140} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-kind">{t("desk.edit.kind")}</Label>
              <select
                id="f-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as FactKind)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {kindSingular(k, t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-detail">{t("desk.edit.note")}</Label>
            <Textarea id="f-detail" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={600} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-quote">{t("desk.edit.quote")}</Label>
            <Textarea
              id="f-quote"
              rows={3}
              className="desk-quote"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={800}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("desk.edit.quoteHelp")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="f-due">{t("desk.edit.due")}</Label>
              <Input id="f-due" type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value.slice(0, 16))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-zone">{t("desk.edit.zone")}</Label>
              <Input id="f-zone" placeholder={t("desk.edit.zonePlaceholder")} value={zone} onChange={(e) => setZone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("desk.edit.cancel")}
            </Button>
            <Button type="submit" disabled={pending || !label.trim()}>
              {pending
                ? t("desk.edit.saving")
                : creating
                  ? t("desk.edit.addProposed")
                  : t("desk.edit.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

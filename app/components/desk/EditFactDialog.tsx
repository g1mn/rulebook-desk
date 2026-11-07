import { useEffect, useState } from "react";

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
import { KIND_ORDER, KIND_SINGULAR, type FactKind } from "@/lib/rulebook";

import type { Fact } from "./FactRow";

export interface FactPatch {
  label?: string;
  detail?: string | null;
  kind?: FactKind;
  quote?: string;
  dueLocal?: string | null;
  timeZone?: string;
}

export function EditFactDialog({
  fact,
  open,
  pending,
  onOpenChange,
  onSave,
}: {
  fact: Fact | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: FactPatch) => void;
}) {
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState<FactKind>("requirement");
  const [quote, setQuote] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [zone, setZone] = useState("");

  useEffect(() => {
    if (!fact) return;
    setLabel(fact.label);
    setDetail(fact.detail ?? "");
    setKind(fact.kind as FactKind);
    setQuote(fact.quote ?? "");
    setDueLocal(fact.dueLocal ?? "");
    setZone(fact.dueTimeZone ?? "");
  }, [fact]);

  function save(event: React.FormEvent) {
    event.preventDefault();
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
            <DialogTitle>Edit fact</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="f-label">Label</Label>
              <Input id="f-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={140} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-kind">Kind</Label>
              <select
                id="f-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as FactKind)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {KIND_SINGULAR[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-detail">Note</Label>
            <Textarea id="f-detail" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={600} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-quote">Exact quote from the page</Label>
            <Textarea
              id="f-quote"
              rows={3}
              className="desk-quote"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={800}
            />
            <p className="text-[11px] text-muted-foreground">
              Checked against the fetched page when you save. Only verified quotes can be approved.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="f-due">Date & time as written</Label>
              <Input id="f-due" type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value.slice(0, 16))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-zone">Page's time zone</Label>
              <Input id="f-zone" placeholder="PT, UTC, Asia/Seoul…" value={zone} onChange={(e) => setZone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !label.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

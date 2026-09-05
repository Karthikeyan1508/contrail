'use client';

import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Undo2, FileSearch } from 'lucide-react';
import { api } from '@/lib/api';
import type { GateResult, RenderProvenance } from '@/lib/types';

export function GateBadge({ status }: { status: GateResult['status'] }) {
  if (status === 'pass') {
    return (
      <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
        <CheckCircle2 className="size-3" aria-hidden /> PASS
      </Badge>
    );
  }
  if (status === 'fail') {
    return (
      <Badge variant="destructive" className="gap-1 font-mono text-[10px]">
        <XCircle className="size-3" aria-hidden /> FAIL
      </Badge>
    );
  }
  return <Badge variant="outline" className="font-mono text-[10px]">SKIP</Badge>;
}

export function GateTable({ gates }: { gates: GateResult[] }) {
  if (!gates.length) {
    return <p className="py-6 text-sm text-muted-foreground">No gate run recorded for this variant.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Gate</TableHead>
          <TableHead>Check</TableHead>
          <TableHead className="w-24">Result</TableHead>
          <TableHead className="w-20 text-right">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {gates.map((g) => (
          <Fragment key={g.id}>
            <TableRow>
              <TableCell className="font-mono text-xs">{g.id}</TableCell>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell><GateBadge status={g.status} /></TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{g.ms}ms</TableCell>
            </TableRow>
            {g.findings.map((f, i) => (
              <TableRow key={`${g.id}-${i}`} className="bg-muted/40">
                <TableCell />
                <TableCell colSpan={3} className="py-2 text-xs">
                  <span className="mr-2 font-mono text-[10px] text-destructive">
                    {f.ruleId ?? f.code}
                  </span>
                  {f.message}
                  {f.evidence ? (
                    <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                      {f.evidence}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

export function ProvenanceSheet({
  provenance,
  passengerName,
  onRolledBack,
}: {
  provenance: RenderProvenance;
  passengerName: string;
  onRolledBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const p = provenance;

  async function rollback() {
    setBusy(true);
    try {
      const r = await api.rollback(p.variant.uid);
      toast.success(`Rolled back to version ${r.variant.version}`, {
        description: p.variant.alias,
      });
      onRolledBack();
    } catch (e) {
      toast.error('Rollback failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <FileSearch className="size-4" aria-hidden />
        Provenance
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Provenance — {passengerName}</SheetTitle>
          <SheetDescription>
            Every string this passenger saw, traced to the fact and the rule that produced it.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] px-4 pb-6">
          {p.fallbackUsed ? (
            <Alert className="mb-4">
              <AlertTitle>Safe fallback served</AlertTitle>
              <AlertDescription>
                No approved variant covered this combination
                {p.preconditionMismatch.length
                  ? ', and the nearest variant’s preconditions did not hold: ' +
                    p.preconditionMismatch.join('; ')
                  : ''}
                . The gap has been logged for the foundry.
              </AlertDescription>
            </Alert>
          ) : null}

          <Tabs defaultValue="facts">
            <TabsList className="w-full">
              <TabsTrigger value="facts">Facts</TabsTrigger>
              <TabsTrigger value="rule">Rule</TabsTrigger>
              <TabsTrigger value="gates">Gates</TabsTrigger>
              <TabsTrigger value="approval">Approval</TabsTrigger>
              <TabsTrigger value="source">Source</TabsTrigger>
            </TabsList>

            <TabsContent value="facts" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slot</TableHead>
                    <TableHead>Rendered as</TableHead>
                    <TableHead className="w-32">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.facts.map((f) => (
                    <TableRow key={f.key}>
                      <TableCell className="font-mono text-[11px]">{f.key}</TableCell>
                      <TableCell className="text-sm">{f.display || <em className="text-muted-foreground">empty</em>}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">{f.source}</Badge>
                        <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">
                          {f.sourceDetail}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="rule" className="mt-4 space-y-3">
              {p.rule ? (
                <>
                  <div className="rounded-md border p-3">
                    <p className="font-mono text-xs text-muted-foreground">{p.rule.id}</p>
                    <p className="mt-1 font-medium">{p.rule.name}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">
                      {p.rule.computedValue}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Derivation
                    </p>
                    <ol className="space-y-1.5 text-sm">
                      {p.rule.reasoning.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <Separator />
                  <p className="text-xs leading-relaxed text-muted-foreground">{p.rule.citation}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No compensable entitlement resolved for this passenger.
                </p>
              )}
            </TabsContent>

            <TabsContent value="gates" className="mt-4">
              <GateTable gates={p.gates} />
            </TabsContent>

            <TabsContent value="approval" className="mt-4 space-y-2 text-sm">
              <Row label="Approved by" value={p.approval.by} />
              <Row label="Approved at" value={new Date(p.approval.at).toLocaleString()} />
              <Row label="Repository" value={p.approval.repository} />
              <Row label="Entry uid" value={p.approval.entryUid} mono />
              <Row label="Variant alias" value={p.variant.alias} mono />
              <Row label="Version" value={String(p.variant.version)} mono />
              <Separator className="my-3" />
              <Row label="Model" value={`${p.model.provider} / ${p.model.name}`} />
              <Row label="Prompt version" value={p.model.promptVersion} mono />
              <Row label="Deterministic" value={p.model.deterministic ? 'yes' : 'no'} />
              <Separator className="my-3" />
              <Row label="Select" value={`${p.timings.selectMs} ms`} mono />
              <Row label="Hydrate" value={`${p.timings.hydrateMs} ms`} mono />
              <Row label="Total" value={`${p.timings.totalMs} ms`} mono />
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={busy || p.variant.uid === 'safe-fallback'}
                onClick={rollback}
              >
                <Undo2 className="size-4" aria-hidden />
                Roll back to previous version
              </Button>
            </TabsContent>

            <TabsContent value="source" className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  The stored variant. Note that it contains no numbers — only slots.
                </p>
                <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {p.variant.slottedBody}
                </pre>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  Contentstack Personalize — the experience this traveller resolves to.
                </p>
                {p.personalize ? (
                  <>
                    <Row label="Experience" value={p.personalize.experienceName} />
                    <Row label="Variant" value={p.personalize.variantName} />
                    <Row label="Matched audience" value={p.personalize.matchedAudience} mono />
                    <Row label="Personalize alias" value={p.personalize.alias} mono />
                    <Row label="Variant group" value={p.personalize.variantGroupUid} mono />
                    {p.personalize.edge ? (
                      <div className="mt-1 rounded-md border p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs text-muted-foreground">
                            Contentstack Personalize edge
                          </span>
                          <span
                            className={
                              'font-mono text-[10px] tracking-wide uppercase ' +
                              (p.personalize.edge.agrees ? 'text-primary' : 'text-destructive')
                            }
                          >
                            {p.personalize.edge.agrees ? 'agrees' : 'differs'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {p.personalize.edge.detail}
                        </p>
                      </div>
                    ) : null}
                    <p className="pt-1 text-xs text-muted-foreground">
                      Resolved by {p.personalize.resolvedBy}.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This traveller matches no audience in the experience, so Personalize would
                    serve the control. Contrail still has a governed variant for them, keyed by
                    combination rather than audience — that is the difference between deciding
                    which variant to show and knowing the variant is safe to show.
                  </p>
                )}
                <Row label="Combination key" value={p.variant.alias} mono />
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'text-right'}>{value}</span>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Factory, Play, Wand2, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import type { CoverageReport, FoundryOutcome } from '@/lib/types';
import { GateBadge, GateTable } from '../provenance-sheet';

export default function FoundryPage() {
  const [outcomes, setOutcomes] = useState<FoundryOutcome[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshCoverage = useCallback(() => {
    api.coverage().then(setCoverage).catch(() => undefined);
  }, []);

  useEffect(refreshCoverage, [refreshCoverage]);

  async function run(body: { fillGaps?: boolean; seedDemo?: boolean }, label: string) {
    setBusy(true);
    try {
      const r = await api.runFoundry(body);
      setOutcomes(r.outcomes);
      toast.success(`${label}: ${r.published} published, ${r.escalated} escalated`);
      refreshCoverage();
    } catch (e) {
      toast.error(label + ' failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const r = await api.clearVariants();
      setOutcomes(null);
      toast.success(`Removed ${r.removed} variants`);
      refreshCoverage();
    } catch (e) {
      toast.error('Clear failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const published = outcomes?.filter((o) => o.published).length ?? 0;
  const total = outcomes?.length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Factory className="size-6 text-primary" aria-hidden />
          Content foundry
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate, gate, publish. This runs off the customer path — nothing here is in a request.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run the pipeline</CardTitle>
          <CardDescription>
            The gap queue is written by the runtime. Filling it is demand-driven, not exhaustive.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={() => run({ seedDemo: true }, 'Demo set')} disabled={busy}>
            <Play className="size-4" aria-hidden />
            Generate demo set
          </Button>
          <Button
            variant="outline"
            onClick={() => run({ fillGaps: true }, 'Gap fill')}
            disabled={busy || !coverage?.gaps.length}
          >
            <Wand2 className="size-4" aria-hidden />
            Close {coverage?.gaps.length ?? 0} observed gaps
          </Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={clear} disabled={busy}>
            <Trash2 className="size-4" aria-hidden />
            Clear store
          </Button>

          {coverage ? (
            <div className="ml-auto flex w-full max-w-xs items-center gap-3">
              <Progress value={coverage.totals.coveragePct} className="h-2" />
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {coverage.totals.covered}/{coverage.totals.cells}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {outcomes ? (
        <>
          <Alert>
            {published === total ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <AlertTriangle className="size-4" aria-hidden />
            )}
            <AlertTitle>
              {published} of {total} combinations published
            </AlertTitle>
            <AlertDescription>
              {total - published > 0
                ? 'Escalated combinations could not satisfy the gates within the retry budget and go to human review. That is the correct outcome, not a bug.'
                : 'Every combination passed all five gates and was written to the variant store with a provenance record.'}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Outcomes</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion multiple className="w-full">
                {outcomes.map((o) => (
                  <AccordionItem key={o.combination} value={o.combination}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex flex-1 flex-wrap items-center gap-2 pr-3 text-left">
                        <Badge
                          variant={o.published ? 'default' : 'destructive'}
                          className="font-mono text-[10px]"
                        >
                          {o.published ? 'PUBLISHED' : 'ESCALATED'}
                        </Badge>
                        <span className="font-mono text-xs">{o.combination}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {o.gates.map((g) => (
                            <GateBadge key={g.id} status={g.status} />
                          ))}
                          <span className="ml-2 font-mono text-[10px] tabular-nums text-muted-foreground">
                            {o.ms}ms
                          </span>
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableHead className="w-40">Variant alias</TableHead>
                            <TableCell className="font-mono text-xs">{o.variantAlias}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableHead>Generator</TableHead>
                            <TableCell className="text-sm">
                              {o.model}
                              {o.deterministic ? (
                                <Badge variant="secondary" className="ml-2 text-[10px]">deterministic</Badge>
                              ) : null}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableHead>Attempts</TableHead>
                            <TableCell className="font-mono text-xs">{o.attempts}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>

                      {o.reason ? (
                        <Alert variant="destructive">
                          <AlertTriangle className="size-4" aria-hidden />
                          <AlertDescription>{o.reason}</AlertDescription>
                        </Alert>
                      ) : null}

                      <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Slotted body — no numbers, only slots
                        </p>
                        <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                          {o.slottedBody}
                        </pre>
                      </div>

                      <Separator />
                      <GateTable gates={o.gates} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

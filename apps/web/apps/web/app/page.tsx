'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, ShieldOff, RefreshCw, TriangleAlert, Wand2, Plane, Users, Languages, Scale,
} from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api, SCENARIO_LABEL, SEGMENT_LABEL } from '@/lib/api';
import type { Scenario, WallEntry } from '@/lib/types';
import { GateTable, ProvenanceSheet } from './provenance-sheet';

const SCENARIOS: Scenario[] = ['cancellation', 'long_delay', 'denied_boarding', 'gate_change'];

export default function CommandDeck() {
  const [scenario, setScenario] = useState<Scenario>('cancellation');
  const [guardrails, setGuardrails] = useState(true);
  const [autoFill, setAutoFill] = useState(false);
  const [entries, setEntries] = useState<WallEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.renderWall(scenario, guardrails, autoFill);
      setEntries(r.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [scenario, guardrails, autoFill]);

  useEffect(() => {
    void load();
  }, [load]);

  const flight = entries?.[0]?.result.flight;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Command deck</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One disruption. Four passengers. Four different correct answers.
          </p>
        </div>
        {flight ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-mono">
              <Plane className="size-3.5" aria-hidden />
              {flight.designator}
            </Badge>
            <Badge variant="destructive" className="font-mono">{flight.status}</Badge>
            <Badge variant={flight.live ? 'default' : 'secondary'} className="font-mono text-[10px]">
              {flight.live ? 'AMADEUS LIVE' : 'AMADEUS FIXTURE'}
            </Badge>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="scenario" className="text-xs uppercase tracking-wide text-muted-foreground">
              Scenario
            </Label>
            <Select value={scenario} onValueChange={(v) => setScenario(v as Scenario)}>
              <SelectTrigger id="scenario" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s} value={s}>{SCENARIO_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator orientation="vertical" className="hidden h-8 sm:block" />

          <div className="flex items-center gap-3">
            {guardrails ? (
              <ShieldCheck className="size-5 text-primary" aria-hidden />
            ) : (
              <ShieldOff className="size-5 text-destructive" aria-hidden />
            )}
            <div>
              <Label htmlFor="guardrails" className="cursor-pointer text-sm font-medium">
                Guardrails
              </Label>
              <p className="text-xs text-muted-foreground">
                {guardrails ? 'Governed variants only' : 'Raw model output, ungated'}
              </p>
            </div>
            <Switch id="guardrails" checked={guardrails} onCheckedChange={setGuardrails} />
          </div>

          <Separator orientation="vertical" className="hidden h-8 sm:block" />

          <div className="flex items-center gap-3">
            <Wand2 className="size-4 text-muted-foreground" aria-hidden />
            <div>
              <Label htmlFor="autofill" className="cursor-pointer text-sm font-medium">
                Close gaps on demand
              </Label>
              <p className="text-xs text-muted-foreground">
                Generate and gate a missing variant at request time
              </p>
            </div>
            <Switch id="autofill" checked={autoFill} onCheckedChange={setAutoFill} />
          </div>

          <Button variant="outline" size="sm" className="ml-auto" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Re-render
          </Button>
        </CardContent>
      </Card>

      {!guardrails ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Guardrails disabled — this is raw model output</AlertTitle>
          <AlertDescription>
            Nothing below has been fact-checked, policy-checked or approved. Every message on this
            screen would reach a real passenger exactly as written.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Could not reach the Contrail API</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading && !entries
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
                <CardContent className="space-y-2">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <Skeleton key={j} className="h-3.5 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))
          : entries?.map((e) => <PassengerCard key={e.passengerId} entry={e} onChanged={load} />)}
      </div>
    </div>
  );
}

function PassengerCard({ entry, onChanged }: { entry: WallEntry; onChanged: () => void }) {
  const { result } = entry;
  const off = !result.guardrails;
  const blockedCount = result.blocked?.findings.length ?? 0;

  return (
    <Card className={off ? 'border-destructive/60 shadow-[0_0_0_1px_var(--destructive)]/20' : undefined}>
      <CardHeader className="gap-2 pb-3">
        <CardTitle className="text-base leading-snug">{entry.name}</CardTitle>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Users className="size-3" aria-hidden />
            {SEGMENT_LABEL[result.context.segment] ?? result.context.segment}
          </Badge>
          <Badge variant="outline" className="gap-1 font-mono text-[10px]">
            <Languages className="size-3" aria-hidden />
            {result.context.locale}
          </Badge>
          <Badge variant="outline" className="gap-1 font-mono text-[10px]">
            <Scale className="size-3" aria-hidden />
            {result.context.regime}
          </Badge>
          <Badge
            variant={off ? 'destructive' : 'default'}
            className="font-mono text-[10px] tabular-nums"
          >
            {off ? 'UNVERIFIED' : result.entitlement.display}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{entry.mustDiffer}</p>
      </CardHeader>

      <CardContent className="pb-3">
        <Separator className="mb-3" />
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{result.message}</p>
      </CardContent>

      <CardFooter className="flex-wrap gap-2 border-t pt-3">
        {off ? (
          <FactualErrorsDialog entry={entry} />
        ) : (
          <>
            {result.provenance ? (
              <ProvenanceSheet
                provenance={result.provenance}
                passengerName={entry.name}
                onRolledBack={onChanged}
              />
            ) : null}
            {blockedCount ? <RejectedCandidateDialog entry={entry} /> : null}
          </>
        )}
      </CardFooter>
    </Card>
  );
}

function FactualErrorsDialog({ entry }: { entry: WallEntry }) {
  const u = entry.result.ungoverned;
  if (!u) return null;
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <TriangleAlert className="size-4" aria-hidden />
        {u.totalFindings} violations
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>What is wrong with this message</DialogTitle>
          <DialogDescription>
            {entry.name} — the gates were disabled, so none of this was caught.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-3">
            {u.factualErrors.map((f, i) => (
              <Alert key={i} variant="destructive">
                <TriangleAlert className="size-4" aria-hidden />
                <AlertTitle className="text-sm">{f.claim}</AlertTitle>
                <AlertDescription className="text-sm">{f.truth}</AlertDescription>
              </Alert>
            ))}
          </div>
          <Separator className="my-4" />
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gate run against this candidate
          </p>
          <GateTable gates={u.gates} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function RejectedCandidateDialog({ entry }: { entry: WallEntry }) {
  const b = entry.result.blocked;
  if (!b) return null;
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}
      >
        <ShieldOff className="size-4" aria-hidden />
        {b.findings.length} blocked
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rejected candidate</DialogTitle>
          <DialogDescription>
            An ungoverned draft for {entry.name} was stopped by {b.gateId} {b.gate}. The passenger
            never saw it.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What the model wrote
          </p>
          <pre className="mb-4 overflow-x-auto rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {b.rawOutput}
          </pre>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Why it was stopped
          </p>
          <GateTable gates={b.gates} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

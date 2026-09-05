'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Grid3x3, Wand2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, SCENARIO_LABEL, SEGMENT_LABEL } from '@/lib/api';
import type { Channel, CoverageReport, Locale, Scenario, Segment } from '@/lib/types';

const STATE_CLASS: Record<string, string> = {
  covered: 'bg-primary text-primary-foreground',
  gap: 'bg-destructive text-destructive-foreground',
  unobserved: 'bg-muted text-muted-foreground',
};

export default function CoveragePage() {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.coverage().then(setReport).catch((e: Error) => toast.error(e.message));
  }, []);

  useEffect(load, [load]);

  async function fill() {
    setBusy(true);
    try {
      const r = await api.runFoundry({ fillGaps: true });
      toast.success(`Closed ${r.published} gaps`);
      load();
    } catch (e) {
      toast.error('Gap fill failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const t = report.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Grid3x3 className="size-6 text-primary" aria-hidden />
            Coverage
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scenario × segment × locale × channel. Red is a combination a real passenger hit that we
            could not answer.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
          <Button size="sm" onClick={fill} disabled={busy || !report.gaps.length}>
            <Wand2 className="size-4" aria-hidden />
            Close {report.gaps.length} gaps
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Approved variants" value={String(t.covered)} sub={`of ${t.cells} combinations`}>
          <Progress value={t.coveragePct} className="mt-3 h-1.5" />
        </Stat>
        <Stat label="Open gaps" value={String(t.gaps)} sub="observed, not covered" />
        <Stat label="Unobserved" value={String(t.unobserved)} sub="no traffic yet — do not generate" />
        <Stat
          label="Content debt"
          value={`${t.contentDebtHours}h`}
          sub="human authoring at 20 min per variant"
        />
      </div>

      {report.gaps.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gap queue</CardTitle>
            <CardDescription>Written by the runtime, ranked by traffic. This is the foundry work list.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Combination</TableHead>
                  <TableHead className="w-24 text-right">Hits</TableHead>
                  <TableHead className="w-48">First seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.gaps.map((g) => (
                  <TableRow key={g.combination}>
                    <TableCell className="font-mono text-xs">{g.combination}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{g.hits}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(g.firstSeenAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Matrix</CardTitle>
          <CardDescription>
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-[2px] bg-primary" /> covered
            </span>
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-[2px] bg-destructive" /> gap
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-[2px] bg-muted" /> unobserved
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={report.dimensions.channels[0]}>
            <TabsList>
              {report.dimensions.channels.map((c) => (
                <TabsTrigger key={c} value={c} className="font-mono text-xs uppercase">
                  {c}
                </TabsTrigger>
              ))}
            </TabsList>
            {report.dimensions.channels.map((channel) => (
              <TabsContent key={channel} value={channel} className="mt-4 space-y-6">
                {report.dimensions.scenarios.map((scenario) => (
                  <ScenarioGrid
                    key={scenario}
                    report={report}
                    scenario={scenario}
                    channel={channel}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioGrid({
  report, scenario, channel,
}: {
  report: CoverageReport;
  scenario: Scenario;
  channel: Channel;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{SCENARIO_LABEL[scenario]}</p>
      <div className="overflow-x-auto">
        <Table className="w-auto min-w-[520px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Segment</TableHead>
              {report.dimensions.locales.map((l) => (
                <TableHead key={l} className="w-28 text-center font-mono text-[10px]">{l}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.dimensions.segments.map((segment) => (
              <TableRow key={segment}>
                <TableCell className="text-xs">{SEGMENT_LABEL[segment] ?? segment}</TableCell>
                {report.dimensions.locales.map((locale) => (
                  <TableCell key={locale} className="text-center">
                    <Cell report={report} scenario={scenario} segment={segment} locale={locale} channel={channel} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Cell({
  report, scenario, segment, locale, channel,
}: {
  report: CoverageReport;
  scenario: Scenario;
  segment: Segment;
  locale: Locale;
  channel: Channel;
}) {
  const cell = report.matrix.find(
    (c) => c.scenario === scenario && c.segment === segment && c.locale === locale && c.channel === channel,
  );
  if (!cell) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className={`h-6 w-16 justify-center border-transparent font-mono text-[10px] tabular-nums ${STATE_CLASS[cell.state]}`}
          />
        }
      >
        {cell.state === 'covered' ? 'OK' : cell.state === 'gap' ? `GAP ${cell.hits}` : '—'}
      </TooltipTrigger>
      <TooltipContent className="font-mono text-xs">
        {scenario} · {segment} · {locale} · {channel}
        <br />
        {cell.state} · {cell.hits} runtime hits
      </TooltipContent>
    </Tooltip>
  );
}

function Stat({
  label, value, sub, children,
}: {
  label: string;
  value: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        {children}
      </CardContent>
    </Card>
  );
}

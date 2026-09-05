'use client';

import { useEffect, useState } from 'react';
import { Scale, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { api } from '@/lib/api';
import type { PolicyPayload } from '@/lib/types';

export default function PolicyPage() {
  const [policy, setPolicy] = useState<PolicyPayload | null>(null);

  useEffect(() => {
    api.policy().then(setPolicy).catch(() => undefined);
  }, []);

  if (!policy) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Scale className="size-6 text-primary" aria-hidden />
          Policy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Legal reviews this page once. The gates enforce it on every generation, forever.
        </p>
      </div>

      <Tabs defaultValue="gates">
        <TabsList>
          <TabsTrigger value="gates">Gates</TabsTrigger>
          <TabsTrigger value="composition">Composition rules</TabsTrigger>
          <TabsTrigger value="regimes">Regulatory regimes</TabsTrigger>
        </TabsList>

        <TabsContent value="gates" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {policy.gates.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">{g.id}</Badge>
                  <CardTitle className="text-base">{g.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{g.blurb}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="composition" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Composition rule set
                <Badge variant="secondary" className="ml-2 font-mono text-[10px]">
                  v{policy.composition.version}
                </Badge>
              </CardTitle>
              <CardDescription>{policy.composition.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion multiple>
                {policy.composition.rules.map((r) => (
                  <AccordionItem key={r.id} value={r.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex flex-1 items-center gap-3 pr-3 text-left">
                        <Badge variant="outline" className="font-mono text-[10px]">{r.id}</Badge>
                        <span className="text-sm font-medium">{r.name}</span>
                        <Badge
                          variant={r.severity === 'block' ? 'destructive' : 'secondary'}
                          className="ml-auto font-mono text-[10px] uppercase"
                        >
                          {r.severity}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">{r.rationale}</p>
                      <Separator />
                      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
                        {JSON.stringify(r, null, 2)}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regimes" className="mt-4 space-y-4">
          {Object.entries(policy.regimes).map(([name, set]) => (
            <Card key={name}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" aria-hidden />
                  <CardTitle className="text-base">{name}</CardTitle>
                </div>
                <CardDescription>{set.instrument}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">{set.citation}</p>
                <pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
                  {JSON.stringify(set, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

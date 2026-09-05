'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import type { Health } from '@/lib/types';

const LABEL: Record<string, string> = {
  amadeus: 'Flight',   // the provider is named in the tooltip, not the badge
  contentstack: 'Content',
  llm: 'Drafter',
};

/** Live/fixture badges. Judges ask "is this all mocked?" — answer on screen. */
export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Badge variant="destructive" className="font-mono text-[10px]">
        API unreachable
      </Badge>
    );
  }
  if (!health) return <Skeleton className="h-5 w-44" />;

  return (
    <div className="flex items-center gap-1.5">
      {(['amadeus', 'contentstack', 'llm'] as const).map((k) => {
        const s = health.subsystems[k];
        const live = s.mode === 'live' || s.mode === 'contentstack';
        return (
          <Tooltip key={k}>
            <TooltipTrigger
              render={
                <Badge
                  variant={live ? 'default' : 'secondary'}
                  className="cursor-default font-mono text-[10px] uppercase tracking-wide"
                />
              }
            >
              {LABEL[k]} {s.mode}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{s.detail}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

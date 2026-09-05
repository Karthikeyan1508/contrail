import { Plane, Factory, Grid3x3, Scale, type LucideIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const NAV: NavItem[] = [
  { href: '/', label: 'Command deck', description: 'Live passenger wall', icon: Plane },
  { href: '/foundry', label: 'Foundry', description: 'Generate, gate, publish', icon: Factory },
  { href: '/coverage', label: 'Coverage', description: 'Scenario × segment × locale', icon: Grid3x3 },
  { href: '/policy', label: 'Policy', description: 'Gates and regulatory regimes', icon: Scale },
];

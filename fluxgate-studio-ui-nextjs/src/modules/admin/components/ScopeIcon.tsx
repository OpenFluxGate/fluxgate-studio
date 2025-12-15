'use client';

import React from 'react';

import { Globe, Key, Server, Settings, Users } from 'lucide-react';

import { type Rule } from '../types';

interface ScopeIconProps {
  scope: Rule['scope'];
}

export const ScopeIcon = ({ scope }: ScopeIconProps) => {
  const icons = {
    PER_IP: Globe,
    PER_USER: Users,
    PER_API_KEY: Key,
    GLOBAL: Server,
    CUSTOM: Settings,
  };
  const Icon = icons[scope] || Globe;
  return <Icon size={14} />;
};

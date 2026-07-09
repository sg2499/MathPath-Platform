'use client';

import React from 'react';
import { BookOpen, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodexItem {
  id: string;
  name: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
  series?: string;
}

interface CodexProps {
  collection: CodexItem[];
}

export function TheCodex({ collection }: CodexProps) {
  // Group collection by series
  const seriesGroups = collection.reduce((acc, item) => {
    const series = item.series || 'Standalone Artifacts';
    if (!acc[series]) acc[series] = [];
    acc[series].push(item);
    return acc;
  }, {} as Record<string, CodexItem[]>);

  if (collection.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl mt-8">
        <BookOpen className="w-16 h-16 text-slate-300 mb-4" />
        <p className="text-slate-400 font-medium text-lg">The Codex is currently empty.</p>
        <p className="text-slate-500 text-sm mt-2">Decrypt caches to start building your collection.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12 w-full max-w-7xl mx-auto py-8">
      {Object.entries(seriesGroups).map(([series, items]) => (
        <div key={series} className="flex flex-col gap-6">
          <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-widest">{series}</h3>
            <span className="bg-orange-500/10 text-orange-500 px-4 py-1 rounded-full font-bold text-sm">
              {items.length} UNLOCKED
            </span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative flex flex-col items-center justify-center p-6 rounded-[2rem] border border-slate-200 dark:border-white/10 bg-white dark:bg-black/40 backdrop-blur-md h-64 overflow-hidden group hover:border-orange-500/50 hover:shadow-xl transition-all duration-500"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-4 bg-orange-500/20 rounded-[100%] absolute bottom-8 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <Trophy className={cn(
                  "w-16 h-16 mb-6 z-10 relative drop-shadow-md group-hover:scale-110 transition-transform duration-500",
                  item.rarity === 'LEGENDARY' ? 'text-yellow-400' : 
                  item.rarity === 'EPIC' ? 'text-purple-400' :
                  item.rarity === 'RARE' ? 'text-cyan-400' : 
                  item.rarity === 'UNCOMMON' ? 'text-emerald-400' : 'text-slate-400'
                )} />
                <span className="font-black uppercase tracking-widest text-center text-sm z-10 text-slate-900 dark:text-white leading-tight">
                  {item.name}
                </span>
                <span className={cn(
                  "text-[10px] mt-2 font-black uppercase tracking-[0.2em] z-10",
                  item.rarity === 'LEGENDARY' ? 'text-yellow-500' : 
                  item.rarity === 'EPIC' ? 'text-purple-500' :
                  item.rarity === 'RARE' ? 'text-cyan-500' : 
                  item.rarity === 'UNCOMMON' ? 'text-emerald-500' : 'text-slate-500'
                )}>
                  {item.rarity}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

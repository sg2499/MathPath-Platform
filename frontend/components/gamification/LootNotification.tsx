'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageOpen, Sparkles } from 'lucide-react';

export interface LootNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  packType: 'ALPHA_PACK' | 'ELITE_CHEST';
}

export function LootNotification({ isOpen, onClose, packType }: LootNotificationProps) {
  // Auto-close after 5 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  const isElite = packType === 'ELITE_CHEST';
  const glowColor = isElite ? 'shadow-yellow-500/50 border-yellow-400' : 'shadow-cyan-500/50 border-cyan-400';
  const bgColor = isElite ? 'bg-gradient-to-br from-yellow-900/90 to-black/90' : 'bg-gradient-to-br from-cyan-900/90 to-black/90';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed bottom-10 right-10 z-[9999] pointer-events-none"
        >
          <div className={`relative flex items-center gap-4 p-4 pr-8 rounded-xl border-2 backdrop-blur-md shadow-2xl ${glowColor} ${bgColor}`}>
            {/* Spinning Light Effect */}
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className={`absolute inset-[-100%] opacity-20 ${isElite ? 'bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(253,224,71,1)_360deg)]' : 'bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(34,211,238,1)_360deg)]'}`}
              />
            </div>

            <div className="relative z-10 flex items-center justify-center w-12 h-12 rounded-lg bg-black/50 border border-white/10">
              {isElite ? (
                <Sparkles className="w-6 h-6 text-yellow-400" />
              ) : (
                <PackageOpen className="w-6 h-6 text-cyan-400" />
              )}
            </div>

            <div className="relative z-10 flex flex-col">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Loot Drop
              </span>
              <span className={`text-lg font-black uppercase tracking-tight ${isElite ? 'text-yellow-400' : 'text-cyan-400'}`}>
                {isElite ? 'Elite Chest Earned!' : 'Alpha Pack Earned!'}
              </span>
              <span className="text-sm text-slate-200 mt-1">
                Check your Vault to open it.
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

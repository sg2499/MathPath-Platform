"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionTemplate, Variants } from "framer-motion";
import { 
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal, 
  Flag, Crown, Flame, Activity, Infinity as InfinityIcon, Clock, Sun, 
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star, 
  Sparkles as SparklesIcon, Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library 
} from "lucide-react";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles, Stars, Torus, Octahedron, Icosahedron } from "@react-three/drei";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

// --- Icon Mapping ---
const IconMap: Record<string, React.ElementType> = {
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal,
  Flag, Crown, Flame, Activity, Infinity: InfinityIcon, Clock, Sun,
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star,
  Sparkles: SparklesIcon, Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library
};

export interface BadgeInspectionModalProps {
  badge: any;
  config: any;
  onClose: () => void;
}

// --- TRUE AAA 3D ENGINE (REACT THREE FIBER) ---

// Custom component to handle time dilation (slow motion after mount)
function TimeDilationEngine({ isLegendary }: { isLegendary: boolean }) {
  const [timeScale, setTimeScale] = useState(isLegendary ? 3.0 : 1.5);
  
  useEffect(() => {
    // Zack Snyder Slow Mo: Start incredibly fast, then violently decelerate
    const timer = setTimeout(() => {
      setTimeScale(0.2);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  useFrame((state, delta) => {
    // Manually progress the scene clock at our custom timescale
    state.scene.rotation.y += delta * timeScale * 0.5;
  });

  return null;
}

function BadgeEnvironment3D({ tier, colorHex }: { tier: string, colorHex: string }) {
  const isLegendary = tier === "LEGENDARY";
  const isSuper = tier === "SUPER";
  
  const color = new THREE.Color(colorHex);
  
  return (
    <>
      <color attach="background" args={['#020617']} />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 0, 0]} intensity={isLegendary ? 100 : 50} color={color} distance={100} />
      <pointLight position={[20, 20, 20]} intensity={20} color={'#ffffff'} />
      <pointLight position={[-20, -20, -20]} intensity={20} color={color} />
      
      <TimeDilationEngine isLegendary={isLegendary} />

      {/* Dynamic Geometries based on Tier */}
      {isLegendary && (
         <Float speed={2} rotationIntensity={2} floatIntensity={2}>
           {/* Massive inner energy ring */}
           <Torus args={[12, 0.1, 16, 100]} rotation={[Math.PI/2, 0, 0]}>
             <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} wireframe />
           </Torus>
           {/* Outer celestial rings */}
           <Torus args={[18, 0.05, 16, 100]} rotation={[Math.PI/3, Math.PI/4, 0]}>
             <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={2} wireframe />
           </Torus>
           <Torus args={[24, 0.05, 16, 100]} rotation={[-Math.PI/3, -Math.PI/4, 0]}>
             <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
           </Torus>
           {/* Floating core monoliths */}
           <Icosahedron args={[4, 0]} position={[0, 0, -10]}>
             <meshStandardMaterial color={color} wireframe transparent opacity={0.1} />
           </Icosahedron>
         </Float>
      )}

      {isSuper && (
         <Float speed={1.5} rotationIntensity={1.5} floatIntensity={1}>
           <Octahedron args={[15, 0]}>
             <meshStandardMaterial color={color} wireframe transparent opacity={0.4} emissive={color} emissiveIntensity={1} />
           </Octahedron>
           <Torus args={[10, 0.05, 16, 50]} rotation={[Math.PI/4, 0, 0]}>
             <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
           </Torus>
         </Float>
      )}

      {!isLegendary && !isSuper && (
         <Float speed={1} rotationIntensity={0.5} floatIntensity={0.5}>
           <Torus args={[15, 0.02, 16, 64]} rotation={[0, 0, 0]}>
             <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
           </Torus>
         </Float>
      )}

      {/* Particles */}
      <Sparkles 
         count={isLegendary ? 500 : isSuper ? 250 : 100} 
         scale={40} 
         size={isLegendary ? 8 : 4} 
         speed={0.4} 
         color={colorHex}
         opacity={0.8}
      />
      <Stars radius={50} depth={50} count={isLegendary ? 3000 : 1000} factor={4} saturation={0} fade speed={1} />

      {/* Hollywood Post Processing Engine */}
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.1} mipmapBlur intensity={isLegendary ? 2.5 : 1.2} />
         <Noise opacity={0.03} />
         <Vignette eskil={false} offset={0.3} darkness={1.1} />
      </EffectComposer>
    </>
  );
}

// --- MAIN MODAL COMPONENT ---

export function BadgeInspectionModal({ badge, config, onClose }: BadgeInspectionModalProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  // High-performance Framer Motion Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 100, mass: 1.5 }; // Heavy momentum
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  // Rotate based on mouse (Max 30deg)
  const rx = useTransform(smoothY, [-0.5, 0.5], [30, -30]);
  const ry = useTransform(smoothX, [-0.5, 0.5], [-30, 30]);

  // Dynamic Specular Highlight / Volumetric Flashlight
  const glareX = useTransform(smoothX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(smoothY, [-0.5, 0.5], [0, 100]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.6) 0%, transparent 60%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const tier = badge.tier;
  const isLegendary = tier === "LEGENDARY";
  const Icon = (IconMap[badge.iconName] || Target) as any;
  const primaryColor = config.burst[0] || "#ffffff";

  const getShapeStyles = (iconName: string) => {
    const shapes: Record<string, { clipPath: string, w: string, h: string }> = {
      "Target": { clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Focus": { clipPath: "polygon(50% 0%, 90% 20%, 100% 60%, 75% 100%, 25% 100%, 0% 60%, 10% 20%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Scan": { clipPath: "polygon(50% 0%, 65% 25%, 100% 25%, 75% 50%, 85% 90%, 50% 70%, 15% 90%, 25% 50%, 0% 25%, 35% 25%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Zap": { clipPath: "polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)", w: "w-56 md:w-72", h: "h-40 md:h-48" },
      "FastForward": { clipPath: "polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Rocket": { clipPath: "polygon(50% 0%, 100% 40%, 80% 100%, 50% 80%, 20% 100%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Medal": { clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Flag": { clipPath: "polygon(0% 0%, 100% 0%, 80% 50%, 100% 100%, 0% 100%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Crown": { clipPath: "polygon(0% 0%, 25% 30%, 50% 0%, 75% 30%, 100% 0%, 90% 100%, 10% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Flame": { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Activity": { clipPath: "polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Infinity": { clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Clock": { clipPath: "polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Sun": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)", w: "w-56 md:w-72", h: "h-40 md:h-48" },
      "AlarmClock": { clipPath: "polygon(30% 0%, 70% 0%, 100% 20%, 100% 80%, 70% 100%, 30% 100%, 0% 80%, 0% 20%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "TrendingUp": { clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "ArrowUpRight": { clipPath: "polygon(50% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "ChevronsUp": { clipPath: "polygon(50% 0%, 100% 40%, 70% 40%, 70% 100%, 30% 100%, 30% 40%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Trophy": { clipPath: "polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Star": { clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Sparkles": { clipPath: "polygon(50% 0%, 55% 45%, 100% 50%, 55% 55%, 50% 100%, 45% 55%, 0% 50%, 45% 45%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Crosshair": { clipPath: "polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Aperture": { clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Radar": { clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Shield": { clipPath: "polygon(0% 10%, 100% 10%, 100% 60%, 50% 100%, 0% 60%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Anchor": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Mountain": { clipPath: "polygon(50% 0%, 100% 20%, 90% 80%, 50% 100%, 10% 80%, 0% 20%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Brain": { clipPath: "polygon(20% 20%, 80% 20%, 100% 80%, 0% 80%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Lightbulb": { clipPath: "polygon(30% 0%, 70% 0%, 100% 40%, 80% 100%, 20% 100%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Library": { clipPath: "polygon(0% 0%, 100% 0%, 90% 50%, 100% 100%, 0% 100%, 10% 50%)", w: "w-48 md:w-64", h: "h-56 md:h-72" }
    };
    return shapes[iconName] || shapes["Target"];
  };
  const shape = getShapeStyles(badge.iconName);

  // Kinetic Typography Animation
  const containerVars: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.8 }
    }
  };
  const letterVars: Variants = {
    hidden: { opacity: 0, x: -20, filter: "blur(10px)" },
    visible: { 
      opacity: 1, 
      x: 0, 
      filter: "blur(0px)",
      transition: { type: "spring", damping: 12, stiffness: 200 }
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-transparent overflow-hidden"
      >
        
        {/* TRUE 3D R3F CANVAS BACKGROUND */}
        <div className="absolute inset-0 z-0 pointer-events-none">
           <Canvas camera={{ position: [0, 0, 30], fov: 45 }} gl={{ antialias: false, powerPreference: "high-performance" }}>
              <BadgeEnvironment3D tier={tier} colorHex={primaryColor} />
           </Canvas>
        </div>

        {/* Dynamic Screen Shake for Legendary */}
        <motion.div 
          initial={{ x: 0, y: 0, scale: 1.05 }}
          animate={isLegendary ? { x: [-10, 10, -5, 5, -2, 2, 0], y: [-10, 10, -5, 5, -2, 2, 0], scale: 1 } : { scale: 1 }}
          transition={isLegendary ? { duration: 1, ease: "easeOut", scale: { duration: 2, ease: "circOut" } } : { duration: 1 }}
          className="absolute inset-0 z-[1] pointer-events-none"
        >
          {/* Heavy Vignette Mask for Text Legibility (Crucial for AAA polish) */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.8)_100%)]" />
          <div className="absolute bottom-0 w-full h-[40vh] pointer-events-none bg-gradient-to-t from-slate-950 to-transparent" />
        </motion.div>

        {/* 3D Interactive Badge Container */}
        <motion.div 
           initial={{ scale: 0.2, y: 200, rotateY: -180 }}
           animate={{ scale: 1, y: 0, rotateY: 0 }}
           transition={{ type: "spring", bounce: 0.3, duration: 1.5 }} // Heavy mass
           className="relative z-10 [perspective:2000px] flex flex-col items-center justify-center mb-8"
        >
           <motion.div 
             ref={cardRef}
             onMouseMove={handleMouseMove}
             onMouseLeave={handleMouseLeave}
             className="relative flex items-center justify-center cursor-pointer transition-transform duration-100 ease-out transform-gpu"
             style={{
                rotateX: rx,
                rotateY: ry,
                filter: `drop-shadow(0 60px 80px ${config.bloomColor}) drop-shadow(0 20px 40px rgba(0,0,0,0.8))`
             }}
           >
              {/* Giant Clipped Polygon (Frosted Glass simulation) */}
              <div 
                className={`relative flex items-center justify-center ${shape.w} ${shape.h} shadow-[inset_0_10px_20px_rgba(255,255,255,0.4)] backdrop-blur-md`} 
                style={{ clipPath: shape.clipPath, background: config.customBg || config.unlockedBg }}
              >
                 <Icon size={120} style={{ color: config.iconColorHex }} className={`drop-shadow-2xl z-20 relative ${config.glitch ? 'animate-pulse' : ''}`} />
                 
                 {/* Internal AAA Glare tracking mouse */}
                 <motion.div 
                    className="absolute inset-0 pointer-events-none z-30 mix-blend-overlay"
                    style={{ background: glareBackground }}
                  />
              </div>

              {/* Legendary Conic Ring Wrapper inside the 3D card */}
              {isLegendary && (
                 <div className="absolute inset-[-60%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_180deg,rgba(255,255,255,0.5)_360deg)] z-[-1] rounded-full pointer-events-none mix-blend-color-dodge blur-[4px]" />
              )}
           </motion.div>
        </motion.div>

        {/* Floating Text Info (Kinetic Typography) */}
        <motion.div 
           initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
           animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
           transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
           className="relative z-10 text-center max-w-4xl px-6"
        >
            <motion.h1 
               variants={containerVars}
               initial="hidden"
               animate="visible"
               className="text-5xl md:text-7xl lg:text-8xl font-black italic uppercase text-white mb-4 tracking-tighter"
               style={{ textShadow: "0 5px 20px rgba(0,0,0,0.8), 0 0 40px rgba(255,255,255,0.2)" }}
            >
               {badge.name.split('').map((char: string, index: number) => (
                 <motion.span key={index} variants={letterVars} className="inline-block">
                   {char === ' ' ? '\u00A0' : char}
                 </motion.span>
               ))}
            </motion.h1>

            <motion.p 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 1.5, duration: 1 }}
               className="text-xl md:text-3xl text-slate-200 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] font-medium leading-relaxed max-w-2xl mx-auto"
            >
               {badge.description}
            </motion.p>
            
            <motion.div 
               initial={{ opacity: 0, scale: 0.8 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 1.8, type: "spring" }}
               className="mt-8 flex items-center justify-center space-x-3"
            >
               <span className={`px-5 py-2 rounded-full text-sm md:text-base font-black uppercase tracking-[0.2em] bg-slate-900/80 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border ${tier === 'LEGENDARY' ? 'text-yellow-400 border-yellow-400/50 shadow-[0_0_15px_rgba(250,204,21,0.2)]' : tier === 'SUPER' ? 'text-indigo-400 border-indigo-400/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'text-slate-300 border-slate-500/50'}`}>
                 {tier} TIER
               </span>
               <span className="px-5 py-2 rounded-full text-sm md:text-base font-black text-emerald-400 uppercase tracking-[0.2em] bg-emerald-950/80 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_0_15px_rgba(16,185,129,0.2)] border border-emerald-500/50">
                 UNLOCKED
               </span>
            </motion.div>
        </motion.div>

        {/* Close Button */}
        <button 
           onClick={onClose}
           className="absolute top-8 right-8 z-50 text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-800 rounded-full p-4 transition-all duration-300 backdrop-blur-md border border-slate-700/50 hover:border-slate-500 hover:scale-110 active:scale-95"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

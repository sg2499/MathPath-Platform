"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionTemplate, Variants } from "framer-motion";
import { 
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal, 
  Flag, Crown, Flame, Activity, Infinity as InfinityIcon, Clock, Sun, 
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star, 
  Sparkles as SparklesIcon, Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library 
} from "lucide-react";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles, Stars, Torus, Octahedron, Icosahedron, Sphere, Grid, Box, Cone, Cylinder, TorusKnot } from "@react-three/drei";
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

function TimeDilationEngine({ isLegendary }: { isLegendary: boolean }) {
  const [timeScale, setTimeScale] = useState(isLegendary ? 4.0 : 2.0);
  
  useEffect(() => {
    // Zack Snyder Slow Mo
    const timer = setTimeout(() => {
      setTimeScale(0.15); // Extreme slow motion
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  useFrame((state, delta) => {
    state.scene.rotation.y += delta * timeScale * 0.5;
  });

  return null;
}

// --- 30 BESPOKE PROCEDURAL ENVIRONMENTS ---

// 1. Target / Crosshair (Lock-On Concentric Rings)
const EnvTarget = ({ color }: { color: THREE.Color }) => (
  <Float speed={2} rotationIntensity={3}>
    <Torus args={[12, 0.2, 16, 100]} rotation={[Math.PI/2, 0, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
    </Torus>
    <Torus args={[18, 0.1, 16, 100]} rotation={[0, Math.PI/2, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} wireframe />
    </Torus>
    <Torus args={[24, 0.3, 16, 100]} rotation={[0, 0, Math.PI/2]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
    </Torus>
  </Float>
);

// 2. Brain (Neural Network / Plexus Core)
const EnvBrain = ({ color }: { color: THREE.Color }) => (
  <Float speed={1.5} rotationIntensity={1.5}>
    <TorusKnot args={[10, 1.5, 200, 32]} rotation={[0,0,0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} wireframe />
    </TorusKnot>
    <Sparkles count={500} scale={30} size={5} speed={0.2} color={color} />
  </Float>
);

// 3. Flame (Inferno Volumetric Fire)
const EnvFlame = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.children.forEach((mesh, i) => {
        mesh.position.y += Math.sin(state.clock.elapsedTime * 2 + i) * 0.1;
        mesh.rotation.x += 0.01;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(20)].map((_, i) => (
        <Icosahedron key={i} args={[Math.random() * 5 + 2, 0]} position={[(Math.random()-0.5)*20, (Math.random()-0.5)*30, (Math.random()-0.5)*20]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.6} />
        </Icosahedron>
      ))}
      <Sparkles count={800} scale={[20, 50, 20]} size={10} speed={2} color={color} />
    </group>
  );
};

// 4. Rocket (Warp Drive)
const EnvRocket = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.children.forEach((mesh) => {
        mesh.position.z += 2;
        if (mesh.position.z > 50) mesh.position.z = -150;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(200)].map((_, i) => (
        <Box key={i} args={[0.2, 0.2, 10]} position={[(Math.random()-0.5)*100, (Math.random()-0.5)*100, -150 + Math.random()*200]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
        </Box>
      ))}
    </group>
  );
};

// 5. Mountain (Low-Poly Terrain)
const EnvMountain = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.z += 0.1;
  });
  return (
    <group position={[0, -20, -50]}>
      <group ref={ref}>
        {[...Array(50)].map((_, i) => (
          <Cone key={i} args={[10 + Math.random()*10, 20 + Math.random()*30, 4]} position={[(Math.random()-0.5)*100, 0, (Math.random()-0.5)*100 - i*5]}>
            <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={0.5} />
          </Cone>
        ))}
      </group>
    </group>
  );
};

// 6. Shield (Energy Forcefield)
const EnvShield = ({ color }: { color: THREE.Color }) => (
  <Float speed={0.5} floatIntensity={0}>
    <Cylinder args={[20, 20, 40, 6]} rotation={[Math.PI/2, 0, 0]}>
      <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={2} transparent opacity={0.3} />
    </Cylinder>
    <Icosahedron args={[18, 1]} rotation={[0, 0, 0]}>
      <meshStandardMaterial color={'#ffffff'} wireframe emissive={'#ffffff'} emissiveIntensity={1} transparent opacity={0.1} />
    </Icosahedron>
  </Float>
);

// 7. Activity (Data Matrix Rain)
const EnvActivity = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.children.forEach((mesh) => {
        mesh.position.y -= 1;
        if (mesh.position.y < -50) mesh.position.y = 50;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(150)].map((_, i) => (
        <Box key={i} args={[0.2, 5, 0.2]} position={[(Math.random()-0.5)*100, Math.random()*100, (Math.random()-0.5)*50 - 20]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} />
        </Box>
      ))}
    </group>
  );
};

// 8. Infinity (Mobius Knot)
const EnvInfinity = ({ color }: { color: THREE.Color }) => (
  <Float speed={1} rotationIntensity={2}>
    <TorusKnot args={[15, 0.5, 300, 20]} rotation={[0, 0, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
    </TorusKnot>
    <Sparkles count={500} scale={40} size={4} color={'#ffffff'} />
  </Float>
);

// 9. Clock / AlarmClock (Giant Gears)
const EnvClock = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.children[0].rotation.z = state.clock.elapsedTime * 0.5;
      ref.current.children[1].rotation.z = -state.clock.elapsedTime * 0.5;
    }
  });
  return (
    <group ref={ref}>
      <Torus args={[15, 2, 8, 20]} position={[-10, 10, -20]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
      </Torus>
      <Torus args={[10, 1.5, 8, 15]} position={[8, -5, -25]}>
        <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} wireframe />
      </Torus>
    </group>
  );
};

// 10. Sun (Supernova)
const EnvSun = ({ color }: { color: THREE.Color }) => (
  <group>
    <Sphere args={[10, 64, 64]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
    </Sphere>
    <Sphere args={[12, 32, 32]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={2} wireframe transparent opacity={0.5} />
    </Sphere>
    <Sparkles count={2000} scale={60} size={6} speed={3} color={color} />
  </group>
);

// 11. Scan / Radar (Grid Sweep)
const EnvScan = ({ color }: { color: THREE.Color }) => (
  <group position={[0, -15, 0]}>
    <Grid args={[100, 100]} cellColor={color} sectionColor={color} sectionThickness={1} cellThickness={0.5} fadeDistance={50} />
    <Float speed={3} floatIntensity={5}>
      <Cone args={[20, 40, 4]} rotation={[Math.PI, 0, 0]} position={[0, 30, 0]}>
        <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={1} />
      </Cone>
    </Float>
  </group>
);

// 12. Library (Spiraling Books)
const EnvLibrary = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.2;
    }
  });
  return (
    <group ref={ref}>
      {[...Array(80)].map((_, i) => {
        const radius = 10 + i * 0.2;
        const angle = i * 0.5;
        const y = -30 + i * 0.8;
        return (
          <Box key={i} args={[3, 4, 0.5]} position={[Math.cos(angle)*radius, y, Math.sin(angle)*radius]} rotation={[0, -angle, 0]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} wireframe={i % 3 === 0} />
          </Box>
        );
      })}
    </group>
  );
};

// 13. Medal / Trophy (Golden Pantheon)
const EnvMedal = ({ color }: { color: THREE.Color }) => (
  <Float speed={1} rotationIntensity={0.5}>
    <Cylinder args={[20, 20, 2, 32]} position={[0, -15, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
    </Cylinder>
    <Cylinder args={[25, 25, 1, 32]} position={[0, -17, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} />
    </Cylinder>
    {[...Array(8)].map((_, i) => (
      <Cylinder key={i} args={[1, 1, 40, 8]} position={[Math.cos((i/8)*Math.PI*2)*18, 0, Math.sin((i/8)*Math.PI*2)*18]}>
        <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={1} />
      </Cylinder>
    ))}
  </Float>
);

// 14. Star (Celestial Geometry)
const EnvStar = ({ color }: { color: THREE.Color }) => (
  <Float speed={2} rotationIntensity={3}>
    <Icosahedron args={[15, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
    </Icosahedron>
    <Icosahedron args={[10, 0]} rotation={[Math.PI/4, Math.PI/4, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={5} />
    </Icosahedron>
  </Float>
);

// 15. Lightbulb (Filament Energy)
const EnvLightbulb = ({ color }: { color: THREE.Color }) => (
  <Float speed={1.5} rotationIntensity={1}>
    <Sphere args={[20, 32, 32]}>
      <meshStandardMaterial color={'#ffffff'} transparent opacity={0.1} wireframe />
    </Sphere>
    <TorusKnot args={[5, 0.2, 100, 16]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={6} />
    </TorusKnot>
    <Sparkles count={200} scale={15} size={3} color={color} />
  </Float>
);

// 16. FastForward / ChevronsUp / ArrowUpRight (Hyper Speed Cones)
const EnvFastForward = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.children.forEach((mesh) => {
        mesh.position.z += 1.5;
        if (mesh.position.z > 30) mesh.position.z = -100;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(60)].map((_, i) => (
        <Cone key={i} args={[2, 10, 4]} rotation={[Math.PI/2, 0, 0]} position={[(Math.random()-0.5)*80, (Math.random()-0.5)*80, -100 + Math.random()*130]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
        </Cone>
      ))}
    </group>
  );
};

// Default fallback for any other badges (Floating Monoliths)
const EnvDefault = ({ color }: { color: THREE.Color }) => (
  <Float speed={1.5} rotationIntensity={2} floatIntensity={2}>
    <Octahedron args={[15, 0]}>
      <meshStandardMaterial color={color} wireframe transparent opacity={0.4} emissive={color} emissiveIntensity={2} />
    </Octahedron>
    <Torus args={[22, 0.05, 16, 50]} rotation={[Math.PI/4, 0, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} />
    </Torus>
    <Torus args={[28, 0.05, 16, 50]} rotation={[-Math.PI/4, Math.PI/2, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
    </Torus>
  </Float>
);


function BadgeEnvironment3D({ iconName, tier, colorHex }: { iconName: string, tier: string, colorHex: string }) {
  const isLegendary = tier === "LEGENDARY";
  const color = new THREE.Color(colorHex);
  
  const renderScene = () => {
    switch (iconName) {
      case "Target":
      case "Crosshair": return <EnvTarget color={color} />;
      case "Brain": return <EnvBrain color={color} />;
      case "Flame": return <EnvFlame color={color} />;
      case "Rocket": return <EnvRocket color={color} />;
      case "Mountain": return <EnvMountain color={color} />;
      case "Shield": return <EnvShield color={color} />;
      case "Activity": return <EnvActivity color={color} />;
      case "Infinity": return <EnvInfinity color={color} />;
      case "Clock":
      case "AlarmClock": return <EnvClock color={color} />;
      case "Sun": return <EnvSun color={color} />;
      case "Scan":
      case "Radar": return <EnvScan color={color} />;
      case "Library": return <EnvLibrary color={color} />;
      case "Medal":
      case "Trophy":
      case "Crown": return <EnvMedal color={color} />;
      case "Star": return <EnvStar color={color} />;
      case "Lightbulb": return <EnvLightbulb color={color} />;
      case "FastForward":
      case "ChevronsUp":
      case "ArrowUpRight": return <EnvFastForward color={color} />;
      default: return <EnvDefault color={color} />;
    }
  };

  return (
    <>
      <color attach="background" args={['#020617']} />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 0, 0]} intensity={100} color={color} distance={150} />
      <pointLight position={[30, 30, 30]} intensity={20} color={'#ffffff'} />
      <pointLight position={[-30, -30, -30]} intensity={20} color={color} />
      
      <TimeDilationEngine isLegendary={isLegendary} />

      {/* Render the specific procedural environment for this badge */}
      {renderScene()}

      {/* Global Ambient Particles */}
      <Sparkles 
         count={isLegendary ? 400 : 150} 
         scale={60} 
         size={4} 
         speed={0.5} 
         color={colorHex}
         opacity={0.5}
      />
      <Stars radius={60} depth={50} count={isLegendary ? 3000 : 1000} factor={4} saturation={0} fade speed={1} />

      {/* Hollywood Post Processing Engine */}
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.1} mipmapBlur intensity={isLegendary ? 3.0 : 1.5} />
         <Noise opacity={0.03} />
         <Vignette eskil={false} offset={0.3} darkness={1.2} />
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

  const springConfig = { damping: 20, stiffness: 100, mass: 1.5 }; 
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  const rx = useTransform(smoothY, [-0.5, 0.5], [30, -30]);
  const ry = useTransform(smoothX, [-0.5, 0.5], [-30, 30]);

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

  // Kinetic Typography Animation (Fixed word wrapping)
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
              <BadgeEnvironment3D iconName={badge.iconName} tier={tier} colorHex={primaryColor} />
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

        {/* Floating Text Info (Kinetic Typography with Word Wrapping Fix) */}
        <motion.div 
           initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
           animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
           transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
           className="relative z-10 text-center max-w-5xl px-4 flex flex-col items-center"
        >
            <motion.h1 
               variants={containerVars}
               initial="hidden"
               animate="visible"
               className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black italic uppercase text-white mb-4 tracking-tighter flex flex-wrap justify-center gap-x-4 md:gap-x-6"
               style={{ textShadow: "0 5px 20px rgba(0,0,0,0.8), 0 0 40px rgba(255,255,255,0.2)" }}
            >
               {badge.name.split(' ').map((word: string, wordIndex: number) => (
                 <span key={wordIndex} className="inline-block whitespace-nowrap">
                   {word.split('').map((char: string, charIndex: number) => (
                     <motion.span key={charIndex} variants={letterVars} className="inline-block">
                       {char}
                     </motion.span>
                   ))}
                 </span>
               ))}
            </motion.h1>

            <motion.p 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 1.5, duration: 1 }}
               className="text-lg md:text-2xl text-slate-200 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] font-medium leading-relaxed max-w-3xl mx-auto"
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

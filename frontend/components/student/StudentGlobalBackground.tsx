"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles as DreiSparkles, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { motion } from "framer-motion";

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const checkDark = () => document.documentElement.classList.contains('dark');
    setIsDark(checkDark());
    const observer = new MutationObserver(() => setIsDark(checkDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function FloatingDataNodes({ count, color, wireframe = true, opacity = 0.3 }: { count: number, color: string, wireframe?: boolean, opacity?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const xFactor = -50 + Math.random() * 100;
      const yFactor = -50 + Math.random() * 100;
      const zFactor = -50 + Math.random() * 100;
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;
    particles.forEach((particle, i) => {
      let { t, factor, speed, xFactor, yFactor, zFactor } = particle;
      t = particle.t += speed / 2;
      const a = Math.cos(t) + Math.sin(t * 1) / 10;
      const b = Math.sin(t) + Math.cos(t * 2) / 10;
      const s = Math.cos(t);
      dummy.position.set(
        (particle.mx / 10) * a + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10,
        (particle.my / 10) * b + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10,
        (particle.my / 10) * b + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10
      );
      dummy.scale.set(s, s, s);
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[0.2, 0]} />
      {wireframe ? (
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
      ) : (
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.2} metalness={0.6} />
      )}
    </instancedMesh>
  );
}

function GlobalDarkConstellation() {
  return (
    <>
      <ambientLight intensity={0.2} />
      <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <DreiSparkles count={300} scale={100} size={4} speed={0.2} opacity={0.3} color="#8b5cf6" />
      <FloatingDataNodes count={150} color="#c084fc" wireframe={true} opacity={0.3} />
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
      </EffectComposer>
    </>
  );
}

function GlobalLightAuroraMesh() {
  return (
    <div className="fixed inset-0 z-[-10] overflow-hidden bg-slate-50 pointer-events-none">
      <div className="absolute inset-0 opacity-40 mix-blend-soft-light bg-[url('/noise.png')]"></div>
      
      {/* Aurora Orbs - Slow CSS Animations */}
      <motion.div 
        animate={{ 
          x: ['0%', '10%', '-10%', '0%'],
          y: ['0%', '-10%', '10%', '0%'],
          scale: [1, 1.1, 0.9, 1]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-orange-300/40 blur-[120px]"
      />
      
      <motion.div 
        animate={{ 
          x: ['0%', '-15%', '5%', '0%'],
          y: ['0%', '15%', '-5%', '0%'],
          scale: [1, 0.9, 1.1, 1]
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute top-[20%] right-[10%] w-[50%] h-[70%] rounded-full bg-sky-300/40 blur-[120px]"
      />

      <motion.div 
        animate={{ 
          x: ['0%', '5%', '-15%', '0%'],
          y: ['0%', '-5%', '15%', '0%'],
          scale: [1, 1.2, 0.8, 1]
        }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute -bottom-[20%] left-[20%] w-[70%] h-[60%] rounded-full bg-violet-300/40 blur-[140px]"
      />
    </div>
  );
}

export default function StudentGlobalBackground() {
  const isDark = useDarkMode();

  if (isDark) {
    return (
      <div className="fixed inset-0 z-[-10] pointer-events-none bg-slate-950 opacity-60 transition-opacity duration-1000">
        <Canvas camera={{ position: [0, 0, 30], fov: 60 }} gl={{ antialias: true, alpha: true }}>
          <GlobalDarkConstellation />
        </Canvas>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[-10] pointer-events-none transition-opacity duration-1000">
      <GlobalLightAuroraMesh />
    </div>
  );
}

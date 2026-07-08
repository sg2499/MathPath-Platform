'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  Float, 
  Environment, 
  Sparkles, 
  MeshTransmissionMaterial, 
  MeshDistortMaterial, 
  Stars, 
} from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

interface RankCinematicOverlayProps {
  tier: string;
  onComplete: () => void;
}

// ============================================================================
// CAMERA RIGS & CHOREOGRAPHY
// ============================================================================

const CopperCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      camera.position.lerp(new THREE.Vector3(0, -10, 15), 0.05);
      camera.lookAt(0, 10, 0);
    } else if (t >= 1.5 && t < 2.0) {
      const shakeIntensity = 2.0 - (t - 1.5) * 4;
      camera.position.set((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity, 10);
      camera.lookAt(0, 0, 0);
    } else {
      const orbitSpeed = 0.5, radius = 12;
      camera.position.lerp(new THREE.Vector3(Math.sin((t - 2.0) * orbitSpeed) * radius, 0, Math.cos((t - 2.0) * orbitSpeed) * radius), 0.05);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const BronzeCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      camera.position.lerp(new THREE.Vector3(20, 0, 0), 0.05);
      camera.lookAt(0, 0, 0);
    } else if (t >= 1.5 && t < 2.0) {
      camera.position.lerp(new THREE.Vector3(0, 0, 15), 0.2);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.lerp(new THREE.Vector3(0, Math.sin(t) * 2, 18), 0.01);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const SilverCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      const z = THREE.MathUtils.lerp(100, 15, Math.pow(t / 1.5, 3));
      camera.position.set(0, 0, z);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.lerp(new THREE.Vector3(Math.sin(t * 0.5) * 5, Math.cos(t * 0.5) * 2, 15), 0.02);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const GoldenCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      camera.position.set(Math.sin(t * 5) * 20, 10, Math.cos(t * 5) * 20);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.lerp(new THREE.Vector3(0, 0, 16), 0.05);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const PlatinumCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      camera.position.set(0, 0, 5);
      camera.rotation.z = t * 2;
    } else {
      camera.position.lerp(new THREE.Vector3(0, 0, 20), 0.05);
      camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, 0, 0.1);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const EmeraldCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      camera.position.lerp(new THREE.Vector3(0, 15, 0.1), 0.05);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.lerp(new THREE.Vector3(0, 0, 15), 0.05);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const DiamondCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(150, 45, Math.pow(t / 1.5, 3));
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      camera.position.set(0, 0, 12);
    } else {
      camera.position.lerp(new THREE.Vector3(0, 0, 15), 0.01);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const ChampionCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t < 1.5) {
      const z = THREE.MathUtils.lerp(1, 25, Math.pow(t / 1.5, 3));
      camera.position.set(0, 0, z);
      (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(100, 45, t / 1.5);
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      if (t > 1.0) {
         camera.position.x += (Math.random() - 0.5) * 0.5;
         camera.position.y += (Math.random() - 0.5) * 0.5;
      }
      camera.lookAt(0, 0, 0);
    } else if (t >= 1.5 && t < 2.5) {
      const shake = (2.5 - t) * 1.5;
      camera.position.set(Math.sin(t * 50) * shake, Math.cos(t * 45) * shake, 25);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.lerp(new THREE.Vector3(0, 2, 28), 0.01);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

// ============================================================================
// 3D SCENE MESHES (WebGL)
// ============================================================================

const CopperMesh = () => {
  const gearRef = useRef<THREE.Group>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (gearRef.current) {
      if (t < 1.5) {
        gearRef.current.position.y = 30 - Math.pow(t / 1.5, 3) * 30;
        gearRef.current.rotation.x = t * 5;
        gearRef.current.rotation.z = t * 2;
      } else {
        gearRef.current.position.y = 0;
        gearRef.current.rotation.x += 0.005;
        gearRef.current.rotation.y += 0.01;
      }
    }
    if (shockwaveRef.current) {
      if (t > 1.5 && t < 2.5) {
        shockwaveRef.current.scale.setScalar(1 + (t - 1.5) * 20);
        (shockwaveRef.current.material as THREE.MeshBasicMaterial).opacity = 1.0 - (t - 1.5);
      } else {
        shockwaveRef.current.scale.setScalar(0);
        (shockwaveRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
  });

  return (
    <>
      <CopperCameraRig />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={2} color="#f59e0b" />
      <pointLight position={[0, -5, 0]} intensity={10} color="#ea580c" distance={20} />
      
      <group ref={gearRef}>
        <mesh scale={2.5}>
          <torusGeometry args={[1.5, 0.6, 32, 16]} />
          <meshStandardMaterial color="#78350f" metalness={0.9} roughness={0.2} emissive="#451a03" emissiveIntensity={0.5} />
        </mesh>
        <mesh scale={2.5} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[1.4, 1.4, 1.2, 8]} />
          <meshStandardMaterial color="#451a03" metalness={0.9} roughness={0.4} wireframe />
        </mesh>
      </group>

      <mesh ref={shockwaveRef} rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[1, 0.1, 16, 64]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
      <Sparkles count={500} scale={20} size={6} speed={2} color="#fcd34d" opacity={0.8} />
    </>
  );
};

const BronzeMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current && state.clock.elapsedTime > 1.5) {
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <>
      <BronzeCameraRig />
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 0, 5]} intensity={20} color="#ea580c" distance={20} />
      <mesh ref={meshRef} scale={2.5} rotation={[Math.PI/2, 0, 0]}>
        <cylinderGeometry args={[2, 2, 0.5, 6]} />
        <meshStandardMaterial color="#9a3412" metalness={0.8} roughness={0.3} emissive="#431407" emissiveIntensity={0.5} />
      </mesh>
      <mesh scale={2.6} rotation={[Math.PI/2, 0, 0]}>
        <cylinderGeometry args={[2, 2, 0.5, 6]} />
        <meshStandardMaterial color="#ea580c" wireframe />
      </mesh>
      <Sparkles count={300} scale={15} size={8} speed={0.5} color="#fdba74" />
    </>
  );
};

const SilverMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 1.5;
      meshRef.current.rotation.x += delta * 0.5;
    }
  });

  return (
    <>
      <SilverCameraRig />
      <ambientLight intensity={1} color="#e0f2fe" />
      <pointLight position={[0, 0, 0]} intensity={30} color="#38bdf8" distance={15} />
      <mesh ref={meshRef} scale={2}>
        <octahedronGeometry args={[2, 0]} />
        <meshStandardMaterial color="#bae6fd" metalness={1} roughness={0.05} />
      </mesh>
      <Sparkles count={1000} scale={[10, 10, 100]} size={3} speed={10} color="#0ea5e9" opacity={0.5} />
    </>
  );
};

const GoldenMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y -= delta * 0.5;
    if (ringRef.current) ringRef.current.rotation.x += delta;
  });

  return (
    <>
      <GoldenCameraRig />
      <ambientLight intensity={1} color="#fef08a" />
      <pointLight position={[0, 0, 0]} intensity={50} color="#eab308" distance={30} />
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[2.5, 2]} />
        <MeshDistortMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={2} distort={0.4} speed={3} roughness={0.1} metalness={1} />
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[4, 0.05, 16, 100]} />
        <meshStandardMaterial color="#fef08a" emissive="#eab308" emissiveIntensity={2} />
      </mesh>
      <Sparkles count={800} scale={20} size={4} speed={0.5} color="#fef08a" />
    </>
  );
};

const PlatinumMesh = () => {
  const meshRef = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.4;
      meshRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <>
      <PlatinumCameraRig />
      <ambientLight intensity={0.5} color="#d8b4fe" />
      <pointLight position={[0, 0, 0]} intensity={40} color="#a855f7" distance={20} />
      <group ref={meshRef}>
        <mesh>
          <icosahedronGeometry args={[2.5, 0]} />
          <meshStandardMaterial color="#f0abfc" metalness={0.9} roughness={0.1} wireframe emissive="#c084fc" emissiveIntensity={2} />
        </mesh>
        <mesh scale={1.2}>
          <icosahedronGeometry args={[2.5, 0]} />
          <meshStandardMaterial color="#d8b4fe" wireframe emissive="#9333ea" emissiveIntensity={1} transparent opacity={0.5} />
        </mesh>
      </group>
      <Stars radius={10} depth={50} count={1000} factor={4} saturation={1} fade speed={2} />
    </>
  );
};

const EmeraldMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y -= delta * 0.3;
    }
  });

  return (
    <>
      <EmeraldCameraRig />
      <ambientLight intensity={0.5} color="#6ee7b7" />
      <pointLight position={[-5, 5, 5]} intensity={30} color="#10b981" />
      <pointLight position={[5, -5, -5]} intensity={30} color="#059669" />
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[2.5, 0]} />
        <MeshTransmissionMaterial backside samples={3} thickness={2} chromaticAberration={1} anisotropy={0.3} distortion={0.5} distortionScale={0.5} temporalDistortion={0.1} color="#34d399" />
      </mesh>
      <Sparkles count={400} scale={15} size={5} speed={0.3} color="#10b981" />
    </>
  );
};

const DiamondMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <>
      <DiamondCameraRig />
      <ambientLight intensity={1} color="#ffffff" />
      <pointLight position={[0, 0, 0]} intensity={50} color="#7dd3fc" distance={20} />
      <mesh ref={meshRef} scale={2}>
        <octahedronGeometry args={[2, 0]} />
        <MeshTransmissionMaterial backside samples={4} thickness={3} chromaticAberration={2} anisotropy={1} clearcoat={1} clearcoatRoughness={0.1} envMapIntensity={3} color="#ffffff" />
      </mesh>
      <Stars radius={5} depth={30} count={2000} factor={6} saturation={0} fade speed={3} />
    </>
  );
};

const ChampionMesh = () => {
  const monolithRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (monolithRef.current) {
      monolithRef.current.rotation.y = t * 0.2;
      monolithRef.current.rotation.z = Math.sin(t * 0.5) * 0.2;
    }
    
    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 15) * 0.15;
      coreRef.current.scale.setScalar(pulse);
      (coreRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 5 + Math.sin(t * 20) * 5;
    }

    if (shellRef.current) {
      if (t > 1.5) {
        const expansion = 1 + Math.min((t - 1.5) * 0.5, 1);
        shellRef.current.scale.setScalar(expansion);
        shellRef.current.rotation.x += 0.05;
        shellRef.current.rotation.y -= 0.03;
      }
    }
  });

  return (
    <>
      <ChampionCameraRig />
      <ambientLight intensity={0.1} color="#ff0000" />
      <pointLight position={[0, 0, 0]} intensity={100} color="#e11d48" distance={50} />
      
      <group ref={monolithRef}>
        <mesh ref={coreRef} scale={1.5}>
          <icosahedronGeometry args={[2, 2]} />
          <MeshDistortMaterial color="#000000" emissive="#e11d48" emissiveIntensity={10} metalness={1} roughness={0} distort={0.4} speed={10} />
        </mesh>
        <mesh ref={shellRef} scale={2}>
          <icosahedronGeometry args={[2.5, 1]} />
          <meshStandardMaterial color="#1a0000" metalness={0.9} roughness={0.1} wireframe emissive="#4c0519" emissiveIntensity={1} />
        </mesh>
      </group>
      <Stars radius={50} depth={50} count={3000} factor={10} saturation={1} fade speed={5} />
      <Sparkles count={1000} scale={40} size={10} speed={4} color="#f43f5e" noise={5} />
    </>
  );
};


// ============================================================================
// MAIN SCENE MANAGER
// ============================================================================
const Scene = ({ tier }: { tier: string }) => {
  const getEffects = () => {
    switch(tier) {
      case 'COPPER':
        return <EffectComposer><Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={2} /><Vignette eskil={false} offset={0.1} darkness={1.3} /></EffectComposer>;
      case 'BRONZE':
        return <EffectComposer><Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={1.5} /><Vignette eskil={false} offset={0.1} darkness={1.1} /></EffectComposer>;
      case 'SILVER':
        return <EffectComposer><Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} intensity={3} /><ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} blendFunction={BlendFunction.NORMAL} /></EffectComposer>;
      case 'GOLD':
        return <EffectComposer><Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={4} /></EffectComposer>;
      case 'PLATINUM':
        return <EffectComposer><Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={3} /><ChromaticAberration offset={new THREE.Vector2(0.005, 0.005)} blendFunction={BlendFunction.NORMAL} /><Noise opacity={0.1} /></EffectComposer>;
      case 'EMERALD':
        return <EffectComposer><Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={2} /><ChromaticAberration offset={new THREE.Vector2(0.004, 0.004)} blendFunction={BlendFunction.NORMAL} /></EffectComposer>;
      case 'DIAMOND':
        return <EffectComposer><Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={5} /><ChromaticAberration offset={new THREE.Vector2(0.008, 0.008)} blendFunction={BlendFunction.NORMAL} /></EffectComposer>;
      case 'CHAMPION':
        return <EffectComposer><Bloom luminanceThreshold={0} luminanceSmoothing={0.1} intensity={5} /><ChromaticAberration offset={new THREE.Vector2(0.015, 0.015)} blendFunction={BlendFunction.NORMAL} /><Noise opacity={0.4} /><Vignette eskil={false} offset={0.1} darkness={1.5} /></EffectComposer>;
      default:
        return null;
    }
  };

  return (
    <>
      <Environment preset="city" />
      {getEffects()}
      
      {tier === 'COPPER' && <CopperMesh />}
      {tier === 'BRONZE' && <BronzeMesh />}
      {tier === 'SILVER' && <SilverMesh />}
      {tier === 'GOLD' && <GoldenMesh />}
      {tier === 'PLATINUM' && <PlatinumMesh />}
      {tier === 'EMERALD' && <EmeraldMesh />}
      {tier === 'DIAMOND' && <DiamondMesh />}
      {tier === 'CHAMPION' && <ChampionMesh />}
    </>
  );
};

// ============================================================================
// TYPOGRAPHY / UI OVERLAY (DOM)
// ============================================================================
const TypographyOverlay = ({ tier }: { tier: string }) => {
  const [showText, setShowText] = useState(false);
  
  useEffect(() => {
    // Reveal text exactly at impact (1.5s sequence)
    const t = setTimeout(() => setShowText(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const getTypography = () => {
    switch (tier) {
      case 'COPPER': return { title: "COPPER FORGED", className: "text-amber-100", shadow: "0 10px 0 #78350f, 0 20px 40px #f59e0b, 0 0 100px #ea580c" };
      case 'BRONZE': return { title: "BRONZE SHIELD", className: "text-orange-100", shadow: "0 8px 0 #431407, 0 15px 30px #9a3412, 0 0 80px #ea580c" };
      case 'SILVER': return { title: "SILVER", className: "text-sky-50 tracking-[0.2em]", shadow: "0 0 20px #bae6fd, 0 0 60px #0284c7, 0 5px 0 #082f49" };
      case 'GOLD': return { title: "GOLDEN ASCENT", className: "text-yellow-100", shadow: "0 5px 0 #713f12, 0 20px 40px #ca8a04, 0 0 100px #eab308" };
      case 'PLATINUM': return { title: "PLATINUM MATRIX", className: "text-fuchsia-100 tracking-widest", shadow: "0 0 20px #e879f9, 0 0 60px #9333ea, 0 10px 0 #3b0764" };
      case 'EMERALD': return { title: "EMERALD FRACTAL", className: "text-emerald-50", shadow: "0 8px 0 #022c22, 0 20px 40px #059669, 0 0 80px #10b981" };
      case 'DIAMOND': return { title: "DIAMOND CORE", className: "text-sky-50 tracking-[0.1em]", shadow: "0 0 30px #7dd3fc, 0 0 80px #0284c7, 0 8px 0 #082f49" };
      case 'CHAMPION': return { title: "CHAMPION", className: "text-rose-50 tracking-[0.1em]", shadow: "0 15px 0 #4c0519, 0 30px 60px #881337, 0 0 150px #e11d48", stroke: "3px #fda4af" };
      default: return { title: tier, className: "text-white tracking-widest", shadow: "0 0 20px #ffffff" };
    }
  };

  const typo = getTypography();

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
      <AnimatePresence>
        {showText && (
          <motion.h1
            initial={{ opacity: 0, scale: 2, filter: "blur(20px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.5, duration: 1.5 }}
            className={`text-6xl md:text-8xl lg:text-[10rem] font-black uppercase text-center w-full px-4 ${typo.className}`}
            style={{ textShadow: typo.shadow, WebkitTextStroke: typo.stroke }}
          >
            {typo.title}
          </motion.h1>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// MAIN WRAPPER
// ============================================================================
export function RankCinematicOverlay({ tier, onComplete }: RankCinematicOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => {
      onComplete();
    }, 8000); 
    return () => {
      setMounted(false);
      clearTimeout(timer);
    };
  }, [onComplete]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
        className="fixed inset-0 z-[999999] bg-black pointer-events-auto overflow-hidden"
        onClick={onComplete}
      >
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
            <Scene tier={tier} />
          </Canvas>
        </div>
        <TypographyOverlay tier={tier} />
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 3, duration: 2 }}
          className="absolute bottom-8 left-0 right-0 text-center text-white/50 text-sm font-medium tracking-widest uppercase pointer-events-none z-50"
        >
          Click anywhere to skip
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

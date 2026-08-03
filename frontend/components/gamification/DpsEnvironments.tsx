import React, { useRef, useMemo, Suspense, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Float, Sparkles, Grid, Torus, TorusKnot, Icosahedron, Cylinder, Octahedron, Sphere, Trail, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Utility for smooth clamping
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ----------------------------------------------------------------------
// IRONCLAD DISCIPLINE (Anvils)
// ----------------------------------------------------------------------

export const EnvDpsIronAnvil = ({ color }: { color: THREE.Color }) => {
  const meshRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (meshRef.current) {
      meshRef.current.rotation.y = t.current * 0.3;
      meshRef.current.position.y = Math.sin(t.current * 2) * 0.2;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={meshRef}>
        {/* Core block */}
        <mesh position={[0, -2, 0]}>
          <boxGeometry args={[12, 5, 7]} />
          <meshStandardMaterial color="#3f3f46" roughness={0.8} metalness={0.5} />
        </mesh>
        <mesh position={[0, -2, 0]}>
          <boxGeometry args={[12.2, 5.2, 7.2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
        </mesh>

        {/* Upper strike face */}
        <mesh position={[0, 2, 0]}>
          <cylinderGeometry args={[4, 5, 3, 4]} />
          <meshStandardMaterial color="#3f3f46" roughness={0.8} metalness={0.5} />
        </mesh>
        <mesh position={[0, 2, 0]}>
          <cylinderGeometry args={[4.2, 5.2, 3.2, 4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} wireframe />
        </mesh>
      </group>
      {/* Heavy descending embers */}
      <Sparkles count={40} scale={15} size={4} speed={0.2} color={color} opacity={0.6} noise={1} />
      <pointLight position={[0, 8, 5]} intensity={10} color={color} distance={40} />
    </group>
  );
};

export const EnvDpsSteelAnvil = ({ color }: { color: THREE.Color }) => {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (groupRef.current) {
      groupRef.current.rotation.y = t.current * 0.6;
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(t.current * 2) * 0.2;
      ringRef.current.rotation.y = Math.cos(t.current * 1.5) * 0.2;
      const mat = ringRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2 + Math.sin(t.current * 5) * 1.5;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={groupRef}>
        <mesh position={[0, -2, 0]}>
          <boxGeometry args={[12, 5, 7]} />
          <meshStandardMaterial color="#0c4a6e" roughness={0.3} metalness={0.9} />
        </mesh>
        <mesh position={[0, -2, 0]}>
          <boxGeometry args={[12.3, 5.3, 7.3]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
        </mesh>
        <mesh position={[0, 2.5, 0]}>
          <cylinderGeometry args={[4.5, 6, 4, 6]} />
          <meshStandardMaterial color="#0c4a6e" roughness={0.3} metalness={0.9} />
        </mesh>
        <mesh position={[0, 2.5, 0]}>
          <cylinderGeometry args={[4.7, 6.2, 4.2, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
        </mesh>
      </group>

      {/* Scanning heat ring */}
      <mesh ref={ringRef} position={[0, 0, 0]}>
        <torusGeometry args={[9, 0.1, 16, 100]} />
        <meshStandardMaterial color={color} emissive={color} />
      </mesh>

      {/* Intense rising heat sparks */}
      <Sparkles count={80} scale={20} size={5} speed={0.8} color="#bae6fd" noise={2} />
      <pointLight position={[0, 5, 5]} intensity={20} color={color} distance={50} />
    </group>
  );
};

export const EnvDpsObsidianAnvil = ({ color }: { color: THREE.Color }) => {
  const T_MINOR = 1.0;
  const shardsRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const shards = useMemo(() =>
    [...Array(24)].map((_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return {
        x: Math.cos(a) * 10,
        z: Math.sin(a) * 10,
        y: (Math.random() - 0.5) * 8,
        rotSpeed: (Math.random() - 0.5) * 4
      };
    }),
  []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    // Minor fracture event at T_MINOR
    const broken = now >= T_MINOR;
    const e = Math.max(0, now - T_MINOR);
    const pre = clamp01(now / T_MINOR);

    if (coreRef.current) {
      // Violent shake before snap
      const jitter = broken ? 0 : Math.pow(pre, 4) * 0.4;
      coreRef.current.position.set(
        (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter,
        0
      );
      coreRef.current.rotation.y = broken ? now * 0.4 : now * 0.1;
    }

    if (shardsRef.current) {
      shardsRef.current.children.forEach((child, i) => {
        const s = shards[i];
        if (!broken) {
          // Pulled tight to core
          child.position.set(s.x * 0.3, s.y * 0.3, s.z * 0.3);
          child.rotation.x += delta * s.rotSpeed;
        } else {
          // Explode out and orbit
          const expand = Math.min(e * 15, 1);
          child.position.set(s.x * (0.3 + expand * 0.7), s.y * (0.3 + expand * 0.7), s.z * (0.3 + expand * 0.7));
          // Orbit
          const angle = now * 1.2 + i;
          const r = 10;
          child.position.x = Math.cos(angle) * r;
          child.position.z = Math.sin(angle) * r;
          child.rotation.y += delta * 3;
        }
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={coreRef}>
        <mesh position={[0, -1, 0]}>
          <boxGeometry args={[13, 8, 8]} />
          <meshStandardMaterial color="#450a0a" roughness={0.1} metalness={1.0} />
        </mesh>
        <mesh position={[0, -1, 0]}>
          <boxGeometry args={[13.3, 8.3, 8.3]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
        </mesh>
      </group>

      <group ref={shardsRef}>
        {shards.map((_, i) => (
          <mesh key={i}>
            <octahedronGeometry args={[1.5, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} wireframe />
          </mesh>
        ))}
      </group>

      <Sparkles count={150} scale={25} size={6} speed={1.5} color="#f97316" noise={3} />
      <pointLight position={[0, 0, 0]} intensity={30} color={color} distance={60} />
    </group>
  );
};

export const EnvDpsCelestialAnvil = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const HOT = "#fcd34d";

  const coreRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  const trailsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const beams = useMemo(() => [...Array(40)].map((_, i) => {
    const a = (i / 40) * Math.PI * 2;
    return { a, speed: 20 + Math.random() * 20 };
  }), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    if (coreRef.current) {
      // Sucking in, spinning violently
      coreRef.current.rotation.y = broken ? now * 0.2 : now * (1 + pre * 10);
      const sc = broken ? 1 : Math.max(0.1, 1 - pre * 0.8);
      coreRef.current.scale.setScalar(sc);
    }

    if (shockRef.current) {
      if (!broken) {
        shockRef.current.scale.setScalar(0.01);
        (shockRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      } else {
        const shockExpand = 1 + e * 40;
        shockRef.current.scale.setScalar(shockExpand);
        (shockRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - e * 1.5);
      }
    }

    if (trailsRef.current) {
      trailsRef.current.children.forEach((child, i) => {
        const b = beams[i];
        if (!broken) {
          child.position.set(0,0,0);
          child.scale.setScalar(0.01);
        } else {
          const dist = e * b.speed;
          child.position.set(Math.cos(b.a) * dist, (Math.random()-0.5) * dist * 0.2, Math.sin(b.a) * dist);
          child.scale.setScalar(1 + e * 5);
          child.lookAt(0,0,0);
        }
      });
    }
  });

  return (
    <group scale={1.5}>
      {/* Event Horizon Core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[7, 32, 32]} />
        <meshBasicMaterial color="#000000" />
        <mesh>
          <sphereGeometry args={[7.3, 32, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} wireframe />
        </mesh>
      </mesh>

      {/* Supernova Shockwave */}
      <mesh ref={shockRef} rotation={[Math.PI/2, 0, 0]}>
        <ringGeometry args={[9, 10, 64]} />
        <meshBasicMaterial color={HOT} side={THREE.DoubleSide} transparent />
      </mesh>

      {/* Explosive Light Beams */}
      <group ref={trailsRef}>
        {beams.map((_, i) => (
          <mesh key={i}>
            <cylinderGeometry args={[0.2, 0, 8, 3]} />
            <meshBasicMaterial color={HOT} />
          </mesh>
        ))}
      </group>

      <Sparkles count={300} scale={40} size={4} speed={4} color={HOT} />
      <pointLight position={[0, 0, 0]} intensity={30} color={color} distance={150} />
    </group>
  );
};

// ----------------------------------------------------------------------
// PURE CRYSTAL (Crystals)
// ----------------------------------------------------------------------

export const EnvDpsQuartzCrystal = ({ color }: { color: THREE.Color }) => {
  const meshRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (meshRef.current) {
      meshRef.current.rotation.y = t.current * 0.4;
      meshRef.current.position.y = Math.sin(t.current) * 0.5;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={meshRef}>
        <mesh>
          <octahedronGeometry args={[11, 0]} />
          <meshPhysicalMaterial color="#ccfbf1" roughness={0.1} transmission={0.9} thickness={2} ior={1.5} />
        </mesh>
        <mesh>
          <octahedronGeometry args={[11.2, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
        </mesh>
      </group>
      <Sparkles count={80} scale={25} size={3} speed={0.5} color="#ffffff" opacity={0.5} />
      <pointLight position={[0, 5, 5]} intensity={12} color={color} distance={60} />
    </group>
  );
};

export const EnvDpsSapphireCrystal = ({ color }: { color: THREE.Color }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const bandsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (meshRef.current) {
      meshRef.current.rotation.y = -t.current * 0.5;
      meshRef.current.rotation.z = Math.sin(t.current * 0.5) * 0.2;
    }
    if (bandsRef.current) {
      bandsRef.current.children.forEach((child, i) => {
        child.position.y = Math.sin(t.current * 2 + i * Math.PI) * 10;
        child.scale.setScalar(1 + Math.cos(t.current * 2 + i * Math.PI) * 0.2);
      });
    }
  });

  return (
    <group scale={1.5}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[12, 0]} />
        <meshPhysicalMaterial color="#1e1b4b" roughness={0} metalness={0.5} transmission={1} thickness={4} ior={2.0} clearcoat={1} />
        <mesh>
          <icosahedronGeometry args={[12.3, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
        </mesh>
      </mesh>

      {/* Scanning laser bands */}
      <group ref={bandsRef}>
        <mesh rotation={[Math.PI/2, 0, 0]}>
          <torusGeometry args={[14, 0.1, 16, 100]} />
          <meshBasicMaterial color="#c7d2fe" />
        </mesh>
        <mesh rotation={[Math.PI/2, 0, 0]}>
          <torusGeometry args={[14, 0.1, 16, 100]} />
          <meshBasicMaterial color="#c7d2fe" />
        </mesh>
      </group>

      <Sparkles count={150} scale={35} size={4} speed={1.2} color="#c7d2fe" />
      <pointLight position={[0, 0, 0]} intensity={20} color={color} distance={80} />
    </group>
  );
};

export const EnvDpsRubyCrystal = ({ color }: { color: THREE.Color }) => {
  const T_MINOR = 1.2;
  const shardsRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const shards = useMemo(() => [...Array(30)].map((_, i) => ({
    x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2,
    dir: new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize()
  })), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const e = Math.max(0, now - T_MINOR);
    const pre = clamp01(now / T_MINOR);

    if (shardsRef.current) {
      shardsRef.current.children.forEach((child, i) => {
        const s = shards[i];
        if (!broken) {
          // Violent vibration
          const jitter = Math.pow(pre, 3) * 0.5;
          child.position.set(s.x + (Math.random()-0.5)*jitter, s.y + (Math.random()-0.5)*jitter, s.z + (Math.random()-0.5)*jitter);
        } else {
          // Freeze explosion in time
          const dist = Math.min(e * 15, 8);
          child.position.set(s.x + s.dir.x * dist, s.y + s.dir.y * dist, s.z + s.dir.z * dist);
          child.rotation.x += delta * 0.2;
          child.rotation.y += delta * 0.2;
        }
      });
    }

    if (pulseRef.current) {
      if (!broken) {
        pulseRef.current.scale.setScalar(0.1);
        (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      } else {
        pulseRef.current.scale.setScalar(1 + e * 10);
        (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - e * 0.5);
      }
    }
  });

  return (
    <group scale={1.5}>
      <group ref={shardsRef}>
        {shards.map((_, i) => (
          <mesh key={i}>
            <dodecahedronGeometry args={[3, 0]} />
            <meshPhysicalMaterial color="#4c0519" roughness={0.1} transmission={0.9} thickness={2} ior={2.2} />
            <mesh>
              <dodecahedronGeometry args={[3.1, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
            </mesh>
          </mesh>
        ))}
      </group>

      {/* Red energy pulse at fracture */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[4, 32, 32]} />
        <meshBasicMaterial color="#fda4af" transparent blending={THREE.AdditiveBlending} />
      </mesh>

      <Sparkles count={200} scale={40} size={3} speed={2} color="#fda4af" />
      <pointLight position={[0, 0, 0]} intensity={25} color={color} distance={100} />
    </group>
  );
};

export const EnvDpsDiamondCrystal = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const HOT = "#ffffff";

  const cubeRef = useRef<THREE.Group>(null);
  const laserRef = useRef<THREE.Mesh>(null);
  const scatterRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const dots = useMemo(() => [...Array(100)].map(() => ({
    dir: new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize(),
    speed: 10 + Math.random() * 30
  })), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    if (cubeRef.current) {
      if (!broken) {
        // Tesseract folding
        cubeRef.current.rotation.x = now * 2;
        cubeRef.current.rotation.y = now * 3;
        cubeRef.current.scale.setScalar(1 - pre * 0.5); // compress
      } else {
        // Shattered
        cubeRef.current.visible = false;
      }
    }

    if (laserRef.current) {
      if (broken) {
        laserRef.current.scale.y = 100;
        laserRef.current.scale.x = Math.max(0, 1 - e * 2);
        laserRef.current.scale.z = Math.max(0, 1 - e * 2);
      } else {
        laserRef.current.scale.setScalar(0);
      }
    }

    if (scatterRef.current) {
      scatterRef.current.children.forEach((child, i) => {
        const d = dots[i];
        if (!broken) {
          child.scale.setScalar(0);
          child.position.set(0,0,0);
        } else {
          // Slowmo explosion
          const dist = Math.min(e * d.speed, 20 + d.speed * 0.2);
          child.position.set(d.dir.x * dist, d.dir.y * dist, d.dir.z * dist);
          child.scale.setScalar(Math.max(0, 1 - e * 0.2));
        }
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={cubeRef}>
        <mesh>
          <boxGeometry args={[12, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} wireframe />
        </mesh>
        <mesh rotation={[Math.PI/4, Math.PI/4, 0]}>
          <boxGeometry args={[10, 10, 10]} />
          <meshStandardMaterial color="#fdf4ff" emissive="#fdf4ff" emissiveIntensity={3} wireframe />
        </mesh>
      </group>

      {/* Orbital laser strike */}
      <mesh ref={laserRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[2, 2, 1, 16]} />
        <meshBasicMaterial color={HOT} transparent opacity={0.8} />
      </mesh>

      {/* Blinding scatter points */}
      <group ref={scatterRef}>
        {dots.map((_, i) => (
          <mesh key={i}>
            <octahedronGeometry args={[0.5, 0]} />
            <meshBasicMaterial color={HOT} />
          </mesh>
        ))}
      </group>

      <Sparkles count={400} scale={50} size={2.5} speed={0} color={HOT} />
      <pointLight position={[0, 0, 0]} intensity={30} color={HOT} distance={150} />
    </group>
  );
};


// ============================================================================
// FAMILY 3: THE BOUNDLESS TOME
// ============================================================================

export const EnvDpsLeatherTome = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (ref.current) {
      ref.current.rotation.y = t.current * 0.2;
      ref.current.position.y = Math.sin(t.current * 1.5) * 0.5;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        {/* Main Book Body */}
        <mesh position={[0, -1, 0]}>
          <boxGeometry args={[14, 3, 10]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} />
        </mesh>
        {/* Magical glowing pages -- was a wireframe box only fractionally
            larger than the solid cover in one axis and smaller in the other
            two, so its 12 edges crisscrossed the cover's own edges into a
            tangled mess. Solid inset emissive slab reads as a clean glow
            instead (2026-08-03 fix). */}
        <mesh position={[0, -1, 0]}>
          <boxGeometry args={[13.4, 2.5, 9.4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
        </mesh>
        {/* Book Binding/Spine */}
        <mesh position={[-7.2, -1, 0]}>
          <boxGeometry args={[1, 3.2, 10.2]} />
          <meshStandardMaterial color="#451a03" roughness={1} />
        </mesh>
      </group>
      <pointLight position={[0, 5, 0]} intensity={15} color={color} distance={60} />
      <Sparkles count={60} scale={20} size={5} speed={0.4} opacity={0.6} color={color} />
    </group>
  );
};

export const EnvDpsSilverTome = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (ref.current) {
      ref.current.rotation.y = t.current * 0.5;
      ref.current.position.y = Math.sin(t.current * 2) * 0.8;
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(t.current * 3) * 0.2;
      ringRef.current.rotation.z = t.current * -1;
      (ringRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t.current * 6);
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[14, 3, 10]} />
          <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
        </mesh>
        {/* Same wireframe-hugging-solid-box tangle as the Leather Tome fix
            above -- solid inset emissive slab instead (2026-08-03 fix). */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[13.4, 2.6, 9.4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
        </mesh>
        <mesh position={[-7.2, 0, 0]}>
          <boxGeometry args={[1.5, 3.5, 10.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.9} />
        </mesh>
      </group>

      {/* Magical scanning ring */}
      <mesh ref={ringRef} position={[0, 0, 0]}>
        <torusGeometry args={[12, 0.2, 16, 100]} />
        <meshStandardMaterial color={color} emissive={color} />
      </mesh>

      <pointLight position={[0, 0, 0]} intensity={25} color={HOT} distance={60} />
      <Sparkles count={100} scale={25} size={6} speed={1.5} opacity={0.8} color={HOT} />
    </group>
  );
};

export const EnvDpsAstralTome = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const pagesRef = useRef<THREE.Group>(null);
  const T_MINOR = 1.0;
  const t = useRef(0);

  const loosePages = useMemo(() => [...Array(24)].map((_, i) => {
    return { a: (i / 24) * Math.PI * 2, yOffset: (Math.random() - 0.5) * 10, speed: 1 + Math.random() * 2 };
  }), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const e = Math.max(0, now - T_MINOR);
    const pre = clamp01(now / T_MINOR);

    if (ref.current) {
      const jitter = broken ? 0 : Math.pow(pre, 4) * 0.5;
      ref.current.position.set(
        (Math.random() - 0.5) * jitter,
        Math.sin(now * 3) + (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter
      );
      ref.current.rotation.y = broken ? now * 0.5 : now * 0.2;

      // Book opens/expands on break
      if (broken) {
        ref.current.scale.y = 1 + Math.min(e * 5, 2);
      }
    }

    if (pagesRef.current) {
      pagesRef.current.children.forEach((child, i) => {
        const p = loosePages[i];
        if (!broken) {
          child.position.set(0, 0, 0);
          child.scale.setScalar(0);
        } else {
          child.scale.setScalar(1);
          const radius = 10 + Math.min(e * 10, 5);
          const angle = p.a + now * p.speed;
          child.position.x = Math.cos(angle) * radius;
          child.position.z = Math.sin(angle) * radius;
          child.position.y = p.yOffset + Math.sin(now * 5 + i) * 2;
          child.rotation.x = now * p.speed;
          child.rotation.y = now * p.speed * 1.5;
        }
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        <mesh>
          <boxGeometry args={[15, 4, 11]} />
          <meshStandardMaterial color="#2e1065" roughness={0.2} metalness={0.5} />
        </mesh>
        <mesh>
          <boxGeometry args={[15.4, 3.4, 11.4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
        </mesh>
      </group>

      <group ref={pagesRef}>
        {loosePages.map((_, i) => (
          <mesh key={i}>
            <planeGeometry args={[2, 3]} />
            <meshBasicMaterial color={HOT} side={THREE.DoubleSide} transparent opacity={0.8} />
          </mesh>
        ))}
      </group>

      <pointLight position={[0, 0, 0]} intensity={40} color={HOT} distance={80} />
      <Sparkles count={150} scale={30} size={5} speed={2} opacity={0.9} color={HOT} />
    </group>
  );
};

export const EnvDpsBoundlessTome = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const vortexRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.PointLight>(null);
  const T_REVEAL = 1.7;
  const t = useRef(0);

  const pages = useMemo(() => [...Array(60)].map((_, i) => {
    return {
      radius: 5 + Math.random() * 20,
      angle: Math.random() * Math.PI * 2,
      y: (Math.random() - 0.5) * 30,
      speed: 2 + Math.random() * 3
    };
  }), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    if (ref.current) {
      // Violent spin and suck in
      ref.current.rotation.y = broken ? now * 0.2 : now * (1 + pre * 10);

      if (!broken) {
        // Shaking intensely
        ref.current.position.set(
          (Math.random() - 0.5) * pre * 2,
          (Math.random() - 0.5) * pre * 2,
          (Math.random() - 0.5) * pre * 2
        );
      } else {
        // Explodes into wireframe massive book
        ref.current.position.set(0, 0, 0);
        ref.current.scale.setScalar(1 + e * 0.5);
      }
    }

    if (vortexRef.current) {
      vortexRef.current.children.forEach((child, i) => {
        const p = pages[i];
        if (!broken) {
          // Swirling vortex pulling inwards
          const currentRadius = Math.max(0, p.radius * (1 - pre));
          const currentAngle = p.angle + now * p.speed * 2;
          child.position.x = Math.cos(currentAngle) * currentRadius;
          child.position.z = Math.sin(currentAngle) * currentRadius;
          child.position.y = p.y * (1 - pre);
          child.rotation.x += delta * 10;
        } else {
          // Explode outwards into a galaxy ring
          const expandRadius = p.radius + e * 30;
          const currentAngle = p.angle + now * p.speed * 0.5;
          child.position.x = Math.cos(currentAngle) * expandRadius;
          child.position.z = Math.sin(currentAngle) * expandRadius;
          child.position.y = p.y * 0.2 + Math.sin(now * 2 + i) * 5;
          child.rotation.y += delta * 2;
        }
      });
    }

    if (flashRef.current) {
      flashRef.current.intensity = broken ? Math.max(0, 200 - e * 80) : 10 + pre * 50;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        <mesh>
          <boxGeometry args={[16, 5, 12]} />
          <meshStandardMaterial color="#082f49" roughness={0.1} metalness={0.8} />
        </mesh>
        <mesh>
          <boxGeometry args={[16.5, 5.5, 12.5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
        </mesh>
      </group>

      <group ref={vortexRef}>
        {pages.map((_, i) => (
          <mesh key={i}>
            <planeGeometry args={[1.5, 2]} />
            <meshBasicMaterial color={HOT} side={THREE.DoubleSide} transparent opacity={0.9} />
          </mesh>
        ))}
      </group>

      <pointLight ref={flashRef} position={[0, 0, 0]} intensity={40} color={HOT} distance={150} />
      <Sparkles count={250} scale={40} size={6} speed={3} opacity={1} color={HOT} noise={2} />
    </group>
  );
};

// ============================================================================
// FAMILY 4: THE LIGHTNING QUILL
// ============================================================================

export const EnvDpsBronzeQuill = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (ref.current) {
      ref.current.rotation.y = Math.sin(t.current * 0.5) * 0.5;
      ref.current.rotation.z = -0.5 + Math.cos(t.current * 0.8) * 0.2;
      ref.current.position.y = Math.sin(t.current * 2) * 1.5;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref} position={[0, 2, 0]}>
        {/* Main Quill Shaft */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.2, 1.5, 15, 6]} />
          <meshStandardMaterial color="#854d0e" roughness={0.6} metalness={0.7} />
        </mesh>
        {/* Wireframe glowing cage */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.5, 1.8, 15.2, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} wireframe />
        </mesh>
      </group>
      <pointLight position={[0, 0, 0]} intensity={25} color={color} distance={60} />
      <Sparkles count={50} scale={15} size={4} speed={0.5} opacity={0.5} color={HOT} />
    </group>
  );
};

export const EnvDpsSilverQuill = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (ref.current) {
      ref.current.rotation.y += delta * 2;
      ref.current.rotation.z = -0.5 + Math.sin(t.current * 1.5) * 0.2;
      ref.current.position.y = Math.sin(t.current * 3) * 1.5;
    }
    if (ringsRef.current) {
      ringsRef.current.children.forEach((ring, i) => {
        ring.rotation.x = Math.PI / 2;
        ring.position.y = Math.sin(t.current * 2 + i) * 6;
        ring.rotation.y += delta * (i % 2 === 0 ? 3 : -3);
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref} position={[0, 2, 0]}>
        <mesh>
          <cylinderGeometry args={[0.1, 1.2, 16, 8]} />
          <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.3, 1.5, 16.2, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
        </mesh>
      </group>

      <group ref={ringsRef}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <torusGeometry args={[5 - i, 0.1, 8, 32]} />
            <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={3} />
          </mesh>
        ))}
      </group>

      <pointLight position={[0, 0, 0]} intensity={35} color={HOT} distance={80} />
      <Sparkles count={100} scale={20} size={5} speed={1.5} opacity={0.7} color={HOT} />
    </group>
  );
};

export const EnvDpsRadiantQuill = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const clonesRef = useRef<THREE.Group>(null);
  const T_MINOR = 1.0;
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (ref.current) {
      if (!broken) {
        ref.current.position.set(
          Math.sin(now * 20) * pre * 2,
          Math.cos(now * 15) * pre * 2 + 2,
          0
        );
      } else {
        ref.current.position.set(0, 2, 0);
        ref.current.rotation.y += delta * 6;
        ref.current.rotation.z = -0.5;
      }
    }

    if (clonesRef.current) {
      clonesRef.current.children.forEach((child, i) => {
        if (!broken) {
          child.scale.setScalar(0);
        } else {
          child.scale.setScalar(1);
          const angle = now * 2 + (i * Math.PI * 2 / 4);
          child.position.x = Math.cos(angle) * 8;
          child.position.z = Math.sin(angle) * 8;
          child.position.y = 2 + Math.sin(now * 5 + i) * 3;
          child.rotation.y = -angle;
          child.rotation.z = -0.5;
        }
      });
    }
  });

  return (
    <group scale={1.5}>
      {/* Main Core Quill */}
      <group ref={ref} position={[0, 2, 0]}>
        <mesh>
          <cylinderGeometry args={[0, 1.8, 18, 4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
        </mesh>
      </group>

      {/* Orbiting Phantom Quills */}
      <group ref={clonesRef}>
        {[0,1,2,3].map((i) => (
          <mesh key={i}>
            <cylinderGeometry args={[0, 1, 10, 4]} />
            <meshBasicMaterial color={HOT} wireframe transparent opacity={0.6} />
          </mesh>
        ))}
      </group>

      <pointLight position={[0, 2, 0]} intensity={50} color={HOT} distance={100} />
      <Sparkles count={150} scale={25} size={6} speed={3} opacity={0.9} color={HOT} />
    </group>
  );
};

export const EnvDpsLightningQuill = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.PointLight>(null);
  const boltsRef = useRef<THREE.Group>(null);
  const T_REVEAL = 1.7;
  const t = useRef(0);

  const bolts = useMemo(() => [...Array(12)].map((_, i) => {
    return { angle: (i / 12) * Math.PI * 2, delay: Math.random() * 0.5 };
  }), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    if (ref.current) {
      if (!broken) {
        // Erratic buildup shake
        ref.current.position.set(
          (Math.random() - 0.5) * pre * 3,
          2 + (Math.random() - 0.5) * pre * 3,
          (Math.random() - 0.5) * pre * 3
        );
        ref.current.rotation.y = now * 10;
        ref.current.rotation.z = -0.5 + (Math.random() - 0.5) * pre;
      } else {
        // Locked in, spinning incredibly fast
        ref.current.position.set(0, 2, 0);
        ref.current.rotation.y = now * 20;
        ref.current.rotation.z = -0.5;
        ref.current.scale.setScalar(1 + Math.sin(now * 30) * 0.1);
      }
    }

    if (flashRef.current) {
      flashRef.current.intensity = broken ? 150 + Math.random() * 50 : 20 + pre * 80;
    }

    if (boltsRef.current) {
      boltsRef.current.children.forEach((child, i) => {
        const b = bolts[i];
        if (!broken || e < b.delay) {
          child.scale.setScalar(0);
        } else {
          // Lightning bolt crashes down
          child.scale.setScalar(1);
          const localE = e - b.delay;

          child.position.x = Math.cos(b.angle) * 12;
          child.position.z = Math.sin(b.angle) * 12;
          // Strike from high above to below
          child.position.y = 20 - localE * 80;

          // Jitter the bolt heavily
          child.rotation.x = (Math.random() - 0.5) * 0.5;
          child.rotation.z = (Math.random() - 0.5) * 0.5;

          // Reset loop
          if (child.position.y < -20) {
            b.delay = e + Math.random() * 0.5; // schedule next strike
          }
        }
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref} position={[0, 2, 0]}>
        <mesh>
          <cylinderGeometry args={[0, 2.5, 20, 6]} />
          <meshBasicMaterial color={HOT} wireframe />
        </mesh>
        {/* Solid core for contrast */}
        <mesh>
          <cylinderGeometry args={[0, 2.2, 19.5, 6]} />
          <meshStandardMaterial color="#020617" roughness={0.1} metalness={1.0} />
        </mesh>
      </group>

      <group ref={boltsRef}>
        {bolts.map((_, i) => (
          <mesh key={i}>
            <cylinderGeometry args={[0.2, 0.2, 15, 4]} />
            <meshBasicMaterial color={HOT} />
          </mesh>
        ))}
      </group>

      <pointLight ref={flashRef} position={[0, 5, 0]} intensity={40} color={HOT} distance={250} />
      <Sparkles count={300} scale={40} size={5} speed={8} opacity={1} color={HOT} noise={3} />
    </group>
  );
};


// ============================================================================
// BATCH 3: THE SAGE'S EYE (Hourglass) & THE UNBROKEN CHAIN
// ============================================================================

export const EnvDpsBronzeHourglass = ({ color }: { color: THREE.Color }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.y = Math.sin(t * 1.5) * 0.3;
    groupRef.current.rotation.z = Math.cos(t * 1) * 0.1;
  });

  return (
    <group scale={3}>
      <ambientLight intensity={2} />
      <directionalLight position={[0, 0, 5]} intensity={3} />
      <directionalLight position={[0, 5, 0]} intensity={2} />

      <Float speed={4} rotationIntensity={1} floatIntensity={1.5}>
        <group ref={groupRef}>
          {/* Top/Bottom Solid Gold Caps */}
          <mesh position={[0, 1.8, 0]}>
            <cylinderGeometry args={[2.5, 2.5, 0.6, 32]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} emissive="#b45309" emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[0, -1.8, 0]}>
            <cylinderGeometry args={[2.5, 2.5, 0.6, 32]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} emissive="#b45309" emissiveIntensity={1.5} />
          </mesh>

          {/* Central Bright Glowing Core (No transparency, bold) */}
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[1.2, 32, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
          </mesh>

          {/* Golden Pillars */}
          <mesh position={[-2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 3.6, 16]} />
            <meshStandardMaterial color="#fcd34d" emissive="#d97706" emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 3.6, 16]} />
            <meshStandardMaterial color="#fcd34d" emissive="#d97706" emissiveIntensity={1.5} />
          </mesh>
        </group>
      </Float>
      <Sparkles count={100} scale={10} size={15} speed={1} opacity={1} color={color} />
    </group>
  );
};

export const EnvDpsSilverHourglass = ({ color }: { color: THREE.Color }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.x = t * 1;
    groupRef.current.rotation.y = t * 1.5;
  });

  return (
    <group scale={3.5}>
      <ambientLight intensity={2} />
      <directionalLight position={[0, 0, 5]} intensity={4} />

      <Float speed={5} rotationIntensity={1.5} floatIntensity={2}>
        <group ref={groupRef}>
          {/* Bright Core */}
          <mesh>
            <sphereGeometry args={[1.5, 32, 32]} />
            <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={3} />
          </mesh>

          {/* Emissive Rings */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[3, 0.2, 16, 100]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[3.2, 0.2, 16, 100]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[3.4, 0.2, 16, 100]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
          </mesh>
        </group>
      </Float>
      <Sparkles count={150} scale={12} size={18} speed={1.5} opacity={1} color={color} />
    </group>
  );
};

export const EnvDpsGoldenHourglass = ({ color }: { color: THREE.Color }) => {
  const groupRef = useRef<THREE.Group>(null);
  const shardsRef = useRef<THREE.Group>(null);
  const T_MINOR = 0.5;
  const tTime = useRef(0);

  useFrame((_, delta) => {
    tTime.current += delta;
    const now = tTime.current;
    if (!groupRef.current || !shardsRef.current) return;

    if (now < T_MINOR) {
      groupRef.current.position.set((Math.random()-0.5)*0.8, (Math.random()-0.5)*0.8, (Math.random()-0.5)*0.8);
      shardsRef.current.scale.set(0,0,0);
    } else {
      groupRef.current.position.lerp(new THREE.Vector3(0, Math.sin(now * 3) * 0.5, 0), 0.2);
      shardsRef.current.rotation.y += 0.1;
      const s = 3 + Math.sin(now * 5) * 0.3;
      shardsRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.2);
    }
  });

  return (
    <group scale={3}>
      <ambientLight intensity={3} />
      <directionalLight position={[0, 0, 5]} intensity={5} />

      <Float speed={5} rotationIntensity={1} floatIntensity={2}>
        <group ref={groupRef}>
          <mesh>
            <sphereGeometry args={[2, 64, 64]} />
            <meshStandardMaterial color="#fef08a" emissive={color} emissiveIntensity={4} />
          </mesh>
          <group ref={shardsRef}>
            {[...Array(20)].map((_, i) => (
              <mesh key={i} position={[
                Math.sin((i/20)*Math.PI*2)*3, Math.cos((i/20)*Math.PI*2)*3, (Math.random()-0.5)*4
              ]} rotation={[Math.random(), Math.random(), 0]}>
                <boxGeometry args={[0.6, 0.6, 0.6]} />
                <meshStandardMaterial color={color} emissive="#ffffff" emissiveIntensity={2} />
              </mesh>
            ))}
          </group>
        </group>
      </Float>
      <Sparkles count={200} scale={15} size={25} speed={2} opacity={1} color={color} />
    </group>
  );
};

export const EnvDpsCelestialEye = ({ color }: { color: THREE.Color }) => {
  const vortexRef = useRef<THREE.Group>(null);
  const T_REVEAL = 1.7;
  const tTime = useRef(0);

  useFrame((_, delta) => {
    tTime.current += delta;
    const now = tTime.current;
    if (!vortexRef.current) return;

    if (now < T_REVEAL) {
      vortexRef.current.rotation.z -= 0.3;
      vortexRef.current.scale.set(0.5, 0.5, 0.5);
    } else {
      vortexRef.current.rotation.z += 0.15;
      vortexRef.current.rotation.y += 0.1;
      const s = 6 + Math.sin(now * 15) * 0.4;
      vortexRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.2);
    }
  });

  return (
    <group scale={3.5}>
      <ambientLight intensity={3} />
      <directionalLight position={[0, 0, 5]} intensity={6} color="#ffffff" />

      <Float speed={6} rotationIntensity={2} floatIntensity={3}>
        <mesh>
          <sphereGeometry args={[1.5, 64, 64]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={5} />
        </mesh>

        <group ref={vortexRef}>
          <mesh>
            <icosahedronGeometry args={[1.5, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
          </mesh>
          {[...Array(40)].map((_, i) => (
            <mesh key={i} position={[
              Math.sin((i/40)*Math.PI*2)*2.5, Math.cos((i/40)*Math.PI*2)*2.5, (Math.random()-0.5)*2
            ]} rotation={[Math.random(), Math.random(), 0]}>
              <octahedronGeometry args={[0.3]} />
              <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={2} />
            </mesh>
          ))}
        </group>
      </Float>
      <Sparkles count={400} scale={18} size={30} speed={3} opacity={1} color={color} />
    </group>
  );
};

export const EnvDpsIronChain = ({ color }: { color: THREE.Color }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.z = Math.sin(t * 1.5) * 0.2;
    groupRef.current.rotation.y = t * 0.8;
  });

  return (
    <group scale={3.5}>
      <ambientLight intensity={2} />
      <directionalLight position={[0, 0, 5]} intensity={4} />

      <Float speed={3} rotationIntensity={1} floatIntensity={1.5}>
        <group ref={groupRef}>
          <mesh position={[0, 0, 0]} rotation={[0, Math.PI/4, 0]}>
            <torusGeometry args={[2, 0.6, 32, 64]} />
            <meshStandardMaterial color="#e4e4e7" metalness={0.9} roughness={0.1} emissive="#a1a1aa" emissiveIntensity={1} />
          </mesh>
          <mesh position={[-2.5, 0, 0]} rotation={[Math.PI/2, Math.PI/4, 0]}>
            <torusGeometry args={[2, 0.6, 32, 64]} />
            <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.3} emissive="#52525b" emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[2.5, 0, 0]} rotation={[Math.PI/2, Math.PI/4, 0]}>
            <torusGeometry args={[2, 0.6, 32, 64]} />
            <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.3} emissive="#52525b" emissiveIntensity={0.8} />
          </mesh>
        </group>
      </Float>
      <Sparkles count={100} scale={12} size={15} speed={1} opacity={1} color={color} />
    </group>
  );
};

export const EnvDpsSteelChain = ({ color }: { color: THREE.Color }) => {
  const gear1Ref = useRef<THREE.Mesh>(null);
  const gear2Ref = useRef<THREE.Mesh>(null);
  const gear3Ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!gear1Ref.current || !gear2Ref.current || !gear3Ref.current) return;
    const t = state.clock.getElapsedTime();
    gear1Ref.current.rotation.z = t * 4;
    gear2Ref.current.rotation.z = -t * 4;
    gear3Ref.current.rotation.x = t * 3;
    gear3Ref.current.rotation.y = t * 3;
  });

  return (
    <group scale={3.5}>
      <ambientLight intensity={3} />
      <directionalLight position={[0, 0, 5]} intensity={5} />

      <Float speed={4} rotationIntensity={1.5} floatIntensity={2}>
        <mesh ref={gear3Ref} position={[0, 0, 0]}>
          <torusKnotGeometry args={[2, 0.6, 128, 32]} />
          <meshStandardMaterial color="#ffffff" metalness={1} roughness={0} emissive={color} emissiveIntensity={2.5} />
        </mesh>
        <mesh ref={gear1Ref} position={[-3.5, 0, -1]}>
          <cylinderGeometry args={[2, 2, 0.8, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
        </mesh>
        <mesh ref={gear2Ref} position={[3.5, 0, -1]}>
          <cylinderGeometry args={[2, 2, 0.8, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
        </mesh>
      </Float>
      <Sparkles count={150} scale={15} size={20} speed={1.5} opacity={1} color={color} />
    </group>
  );
};

export const EnvDpsDiamondChain = ({ color }: { color: THREE.Color }) => {
  const groupRef = useRef<THREE.Group>(null);
  const laserRef = useRef<THREE.Mesh>(null);
  const T_MINOR = 0.5;
  const tTime = useRef(0);

  useFrame((_, delta) => {
    tTime.current += delta;
    const now = tTime.current;
    if (!groupRef.current || !laserRef.current) return;

    if (now < T_MINOR) {
      groupRef.current.position.set((Math.random()-0.5)*1, (Math.random()-0.5)*1, (Math.random()-0.5)*1);
      laserRef.current.scale.set(0, 0, 0);
    } else {
      groupRef.current.position.lerp(new THREE.Vector3(0, Math.sin(now * 4) * 0.5, 0), 0.2);
      groupRef.current.rotation.y += 0.15;
      const laserScale = 1.5 + Math.sin(now * 20) * 0.3;
      laserRef.current.scale.set(laserScale, 1, laserScale);
      laserRef.current.rotation.y = now * 15;
    }
  });

  return (
    <group scale={3.5}>
      <ambientLight intensity={3} />
      <directionalLight position={[0, 0, 5]} intensity={5} />

      <Float speed={5} rotationIntensity={1.5} floatIntensity={2.5}>
        <group ref={groupRef}>
          <mesh position={[0, 2.5, 0]} rotation={[Math.PI/2, 0, 0]}>
            <torusGeometry args={[2.5, 0.5, 32, 32]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.9} emissive="#ffffff" emissiveIntensity={2} />
          </mesh>
          <mesh position={[0, -2.5, 0]} rotation={[Math.PI/2, 0, 0]}>
            <torusGeometry args={[2.5, 0.5, 32, 32]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.9} emissive="#ffffff" emissiveIntensity={2} />
          </mesh>

          <mesh ref={laserRef}>
            <cylinderGeometry args={[1, 1, 15, 64]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} />
          </mesh>
        </group>
      </Float>
      <Sparkles count={250} scale={18} size={25} speed={2} opacity={1} color={color} />
    </group>
  );
};

export const EnvDpsUnbrokenMechanism = ({ color }: { color: THREE.Color }) => {
  const loopRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const T_REVEAL = 1.7;
  const tTime = useRef(0);

  useFrame((_, delta) => {
    tTime.current += delta;
    const now = tTime.current;
    if (!loopRef.current || !coreRef.current) return;

    if (now < T_REVEAL) {
      loopRef.current.rotation.x -= 0.6;
      coreRef.current.scale.set(0.5, 0.5, 0.5);
    } else {
      loopRef.current.rotation.x += 0.2;
      loopRef.current.rotation.y += 0.15;

      const burstScale = 3.5 + Math.sin(now * 10) * 0.2;
      loopRef.current.scale.lerp(new THREE.Vector3(burstScale, burstScale, burstScale), 0.2);

      const coreScale = 3 + Math.sin(now * 25) * 0.4;
      coreRef.current.scale.set(coreScale, coreScale, coreScale);
    }
  });

  return (
    <group scale={3.5}>
      <ambientLight intensity={4} />
      <directionalLight position={[0, 0, 5]} intensity={6} color="#ffffff" />

      <Float speed={6} rotationIntensity={2} floatIntensity={3}>
        <mesh ref={coreRef}>
          <sphereGeometry args={[1.5, 64, 64]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={5} />
        </mesh>

        <group ref={loopRef}>
          <mesh rotation={[Math.PI/4, 0, 0]}>
            <torusGeometry args={[4, 0.3, 64, 100]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
          </mesh>
          <mesh rotation={[-Math.PI/4, 0, 0]}>
            <torusGeometry args={[4, 0.3, 64, 100]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
          </mesh>
          <mesh rotation={[0, Math.PI/4, 0]}>
            <torusGeometry args={[4.2, 0.2, 64, 100]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={3} />
          </mesh>
        </group>
      </Float>
      <Sparkles count={400} scale={20} size={30} speed={3} opacity={1} color={color} />
    </group>
  );
};


// ==============================================================================
// BATCH 4: RISING PHOENIX & MASTER'S ANVIL
// ==============================================================================


// ============================================================================
// Phase 7 DPS Batch 4 (Rising Phoenix & Master's Anvil) - TRUE PROCEDURAL GEOMETRY
// ============================================================================

export const EnvDpsAshFeather = ({ color }: { color: THREE.Color }) => {
  const HOT = "#fca5a5";
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (ref.current) {
      ref.current.rotation.y = Math.sin(t.current * 0.5) * 0.2;
      ref.current.position.y = Math.sin(t.current * 2) * 0.5;

      // Animate the barbs (children 1 to 10)
      ref.current.children.forEach((child, index) => {
        if (index > 0) {
          child.rotation.z = (Math.PI / 4) + Math.sin(t.current * 3 + index) * 0.1;
        }
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        {/* Central Quill */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.1, 10, 8]} />
          <meshStandardMaterial color="#7f1d1d" emissive="#7f1d1d" emissiveIntensity={2} />
        </mesh>

        {/* Geometric Barbs */}
        {[...Array(10)].map((_, i) => (
          <mesh key={i} position={[(i%2===0?1:-1) * (1.5 + (i/10)), 3 - i*0.8, 0]} rotation={[0, 0, (i%2===0?1:-1) * Math.PI/4]}>
            <boxGeometry args={[4 - (i/3), 0.2, 0.1]} />
            <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={1 + Math.sin(i)*0.5} transparent opacity={0.8} />
          </mesh>
        ))}
      </group>
      <pointLight position={[0, 0, 0]} intensity={25} color={HOT} distance={60} />
      <Sparkles count={150} scale={15} size={4} speed={2} opacity={0.6} color={HOT} />
    </group>
  );
};

export const EnvDpsEmberWing = ({ color }: { color: THREE.Color }) => {
  const HOT = "#fca5a5";
  const wingRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (wingRef.current) {
      // Sweeping wing flap
      wingRef.current.rotation.z = Math.sin(t.current * 2) * 0.3;
      wingRef.current.rotation.y = t.current * 0.2;
    }
  });

  return (
    <group scale={1.2}>
      <group ref={wingRef} position={[-4, -2, 0]}>
        {[...Array(15)].map((_, i) => {
          const length = 4 + Math.sin(i/15 * Math.PI) * 6;
          return (
            <mesh key={i} position={[i * 0.6, Math.pow(i*0.2, 2), 0]} rotation={[0, 0, -i*0.1]}>
              <boxGeometry args={[0.4, length, 0.2]} />
              <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1 + i/15} wireframe={i%3===0} />
            </mesh>
          );
        })}
      </group>
      <pointLight position={[0, 0, 0]} intensity={30} color={HOT} distance={60} />
      <Sparkles count={200} scale={20} size={6} speed={3} opacity={0.8} color={HOT} />
    </group>
  );
};

export const EnvDpsGoldenPhoenix = ({ color }: { color: THREE.Color }) => {
  const HOT = "#fef08a";
  const coreRef = useRef<THREE.Mesh>(null);
  const wingsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (coreRef.current) {
      coreRef.current.rotation.y = t.current * 4;
      coreRef.current.rotation.x = t.current * 2;
    }
    if (wingsRef.current) {
      wingsRef.current.children[0].rotation.z = Math.sin(t.current * 4) * 0.5;
      wingsRef.current.children[1].rotation.z = -Math.sin(t.current * 4) * 0.5;
    }
  });

  return (
    <group scale={1.5}>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[2, 0]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={3} />
      </mesh>

      <group ref={wingsRef}>
        {/* Left Wing */}
        <group position={[-2, 0, 0]}>
          {[...Array(5)].map((_, i) => (
             <mesh key={i} position={[-i*1.5, Math.sin(i)*2, 0]} rotation={[0, 0, i*0.2]}>
               <cylinderGeometry args={[0, 0.5, 6, 4]} />
               <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={2} wireframe />
             </mesh>
          ))}
        </group>
        {/* Right Wing */}
        <group position={[2, 0, 0]}>
          {[...Array(5)].map((_, i) => (
             <mesh key={i} position={[i*1.5, Math.sin(i)*2, 0]} rotation={[0, 0, -i*0.2]}>
               <cylinderGeometry args={[0, 0.5, 6, 4]} />
               <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={2} wireframe />
             </mesh>
          ))}
        </group>
      </group>

      <pointLight position={[0, 0, 0]} intensity={40} color={HOT} distance={80} />
      <Sparkles count={300} scale={25} size={5} speed={4} opacity={0.9} color={HOT} />
    </group>
  );
};

export const EnvDpsSolarRebirth = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const sunRef = useRef<THREE.Mesh>(null);
  const shell1Ref = useRef<THREE.Mesh>(null);
  const shell2Ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (sunRef.current) {
      const pulse = 1 + Math.sin(t.current * 8) * 0.2;
      sunRef.current.scale.set(pulse, pulse, pulse);
    }
    if (shell1Ref.current && shell2Ref.current) {
      shell1Ref.current.rotation.y = t.current * 0.5;
      shell1Ref.current.rotation.x = t.current * 0.3;
      shell2Ref.current.rotation.y = -t.current * 0.6;
      shell2Ref.current.rotation.z = t.current * 0.4;

      // Drift apart
      const drift = Math.min(2, t.current * 0.5);
      shell1Ref.current.scale.setScalar(1 + drift*0.2);
      shell2Ref.current.scale.setScalar(1.2 + drift*0.3);
    }
  });

  return (
    <group scale={1.8}>
      <mesh ref={sunRef}>
        <sphereGeometry args={[2, 32, 32]} />
        <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={4} />
      </mesh>

      <mesh ref={shell1Ref}>
        <icosahedronGeometry args={[2.5, 1]} />
        <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={1} wireframe />
      </mesh>

      <mesh ref={shell2Ref}>
        <icosahedronGeometry args={[3, 0]} />
        <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={1} wireframe />
      </mesh>

      <pointLight position={[0, 0, 0]} intensity={50} color={HOT} distance={100} />
      <Sparkles count={400} scale={30} size={8} speed={5} opacity={1} color="#fef08a" />
    </group>
  );
};

export const EnvDpsResilienceHammer = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ef4444";
  const rigRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (rigRef.current) {
      // Rhythmic slamming (2 second loop)
      const cycle = t.current % 2;
      if (cycle < 1.5) {
        // Pull back
        rigRef.current.rotation.z = THREE.MathUtils.lerp(rigRef.current.rotation.z, Math.PI / 4, 0.05);
      } else {
        // SLAM
        rigRef.current.rotation.z = THREE.MathUtils.lerp(rigRef.current.rotation.z, -Math.PI / 6, 0.3);
      }
    }
    if (lightRef.current) {
      const cycle = t.current % 2;
      if (cycle > 1.5 && cycle < 1.6) {
        lightRef.current.intensity = 100;
      } else {
        lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 20, 0.1);
      }
    }
  });

  return (
    <group scale={1.5}>
      <group position={[0, -2, 0]}>
        <group ref={rigRef} position={[0, -4, 0]}>
          <group position={[0, 4, 0]}>
            {/* Handle */}
            <mesh position={[0, -3, 0]}>
              <cylinderGeometry args={[0.4, 0.3, 8, 16]} />
              <meshStandardMaterial color="#451a03" roughness={0.9} />
            </mesh>
            {/* Hammer Head */}
            <mesh position={[0, 1.5, 0]} rotation={[0, 0, Math.PI/2]}>
              <boxGeometry args={[3, 5, 3]} />
              <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.3} />
            </mesh>
            {/* Striking Faces */}
            <mesh position={[-2.6, 1.5, 0]} rotation={[0, 0, Math.PI/2]}>
              <boxGeometry args={[2.8, 0.5, 2.8]} />
              <meshStandardMaterial color="#71717a" metalness={0.9} />
            </mesh>
            <mesh position={[2.6, 1.5, 0]} rotation={[0, 0, Math.PI/2]}>
              <boxGeometry args={[2.8, 0.5, 2.8]} />
              <meshStandardMaterial color="#71717a" metalness={0.9} />
            </mesh>
          </group>
        </group>
      </group>
      <pointLight ref={lightRef} position={[-4, 0, 0]} intensity={20} color={HOT} distance={60} />
      <Sparkles count={200} scale={20} size={6} speed={1} opacity={0.8} color={HOT} />
    </group>
  );
};

export const EnvDpsResilienceAnvil = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ef4444";
  const anvilRef = useRef<THREE.Group>(null);
  const scanlinesRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (anvilRef.current) {
      anvilRef.current.rotation.y = t.current * 0.3;
    }
    if (scanlinesRef.current) {
      scanlinesRef.current.position.y = Math.sin(t.current * 2) * 3;
      scanlinesRef.current.rotation.y = t.current * 0.3; // match anvil
    }
  });

  return (
    <group scale={1.3} position={[0, -2, 0]}>
      <group ref={anvilRef}>
        {/* Base */}
        <mesh position={[0, 0, 0]}>
           <boxGeometry args={[8, 1, 5]} />
           <meshStandardMaterial color="#18181b" metalness={0.8} roughness={0.4} />
        </mesh>
        {/* Waist */}
        <mesh position={[0, 1.5, 0]}>
           <boxGeometry args={[5, 2, 3]} />
           <meshStandardMaterial color="#27272a" metalness={0.7} />
        </mesh>
        {/* Top */}
        <mesh position={[0, 3, 0]}>
           <boxGeometry args={[9, 1, 4]} />
           <meshStandardMaterial color="#3f3f46" metalness={0.9} />
        </mesh>
        {/* Horn */}
        <mesh position={[5.5, 3, 0]} rotation={[0, 0, -Math.PI/2]}>
           <cylinderGeometry args={[0.2, 1.5, 3, 16]} />
           <meshStandardMaterial color="#3f3f46" metalness={0.9} />
        </mesh>
      </group>

      <group ref={scanlinesRef}>
        <mesh position={[0, 1.5, 0]} rotation={[Math.PI/2, 0, 0]}>
          <torusGeometry args={[5, 0.1, 16, 100]} />
          <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={4} />
        </mesh>
      </group>

      <pointLight position={[0, 5, 0]} intensity={30} color={HOT} distance={50} />
      <Sparkles count={150} scale={15} size={5} speed={1} opacity={0.6} color={HOT} />
    </group>
  );
};

export const EnvDpsResilienceForge = ({ color }: { color: THREE.Color }) => {
  const HOT = "#fca5a5";
  const fireRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (fireRef.current) {
      fireRef.current.children.forEach((flame, i) => {
         const s = 1 + Math.sin(t.current * (10 + i)) * 0.4;
         flame.scale.set(s, s, s);
         flame.rotation.x = t.current * (i + 1);
         flame.rotation.y = t.current * (i + 2);
      });
    }
  });

  return (
    <group scale={1.2}>
      {/* The Anvil Foreground */}
      <group position={[0, -3, 3]} scale={0.6}>
        <mesh position={[0, 0, 0]}><boxGeometry args={[8, 1, 5]} /><meshStandardMaterial color="#18181b" /></mesh>
        <mesh position={[0, 1.5, 0]}><boxGeometry args={[5, 2, 3]} /><meshStandardMaterial color="#27272a" /></mesh>
        <mesh position={[0, 3, 0]}><boxGeometry args={[9, 1, 4]} /><meshStandardMaterial color="#3f3f46" /></mesh>
      </group>

      {/* The Forge Archway */}
      <group position={[0, -2, -2]}>
         {/* Left Pillar */}
         <mesh position={[-6, 4, 0]}><boxGeometry args={[3, 10, 4]} /><meshStandardMaterial color="#451a03" roughness={1} /></mesh>
         {/* Right Pillar */}
         <mesh position={[6, 4, 0]}><boxGeometry args={[3, 10, 4]} /><meshStandardMaterial color="#451a03" roughness={1} /></mesh>
         {/* Arch */}
         <mesh position={[0, 9, 0]}><boxGeometry args={[10, 3, 4]} /><meshStandardMaterial color="#78350f" roughness={1} /></mesh>
      </group>

      {/* The Raging Fire */}
      <group ref={fireRef} position={[0, 1, -2]}>
         {[...Array(6)].map((_, i) => (
            <mesh key={i} position={[(Math.random()-0.5)*6, (Math.random()-0.5)*4, (Math.random()-0.5)*2]}>
               <icosahedronGeometry args={[1.5, 1]} />
               <meshStandardMaterial color="#ef4444" emissive="#f97316" emissiveIntensity={2 + Math.random()*2} wireframe />
            </mesh>
         ))}
      </group>

      <pointLight position={[0, 2, 0]} intensity={50} color={HOT} distance={80} />
      <Sparkles count={300} scale={25} size={7} speed={5} opacity={1} color="#f97316" />
    </group>
  );
};

export const EnvDpsResilienceCore = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const coreRef = useRef<THREE.Mesh>(null);
  const fragRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (coreRef.current) {
      coreRef.current.rotation.y = t.current * 10;
      coreRef.current.rotation.x = t.current * 5;
      const s = 1 + Math.sin(t.current * 15) * 0.1;
      coreRef.current.scale.set(s, s, s);
    }
    if (fragRef.current) {
      fragRef.current.rotation.y = t.current * 0.5;
      fragRef.current.children.forEach((frag, i) => {
        const offset = Math.sin(t.current * 2 + i) * 0.5;
        frag.position.normalize().multiplyScalar(4 + offset);
      });
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI/2 + Math.sin(t.current * 3) * 0.2;
      ringRef.current.rotation.y = Math.cos(t.current * 2) * 0.2;
      ringRef.current.rotation.z = -t.current * 2;
    }
  });

  return (
    <group scale={1.4}>
      <mesh ref={coreRef}>
        <octahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={5} />
      </mesh>

      <group ref={fragRef}>
        <mesh position={[-4, 2, -4]}><boxGeometry args={[3, 3, 3]} /><meshStandardMaterial color="#27272a" metalness={0.9} /></mesh>
        <mesh position={[4, 2, 4]}><boxGeometry args={[4, 2, 2]} /><meshStandardMaterial color="#27272a" metalness={0.9} /></mesh>
        <mesh position={[4, -2, -4]}><boxGeometry args={[2, 4, 3]} /><meshStandardMaterial color="#27272a" metalness={0.9} /></mesh>
        <mesh position={[-4, -2, 4]}><boxGeometry args={[3, 2, 4]} /><meshStandardMaterial color="#27272a" metalness={0.9} /></mesh>
      </group>

      <mesh ref={ringRef}>
        <torusGeometry args={[7, 0.1, 16, 100]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={3} />
      </mesh>

      <pointLight position={[0, 0, 0]} intensity={60} color={HOT} distance={100} />
      <Sparkles count={400} scale={20} size={5} speed={4} opacity={0.9} color={HOT} />
      <Sparkles count={100} scale={10} size={10} speed={8} opacity={1} color="#ef4444" />
    </group>
  );
};


// ============================================================================
// Phase 8 DPS Batch 5 (Midnight Oil & Golden Compass)
// ============================================================================

export const EnvDpsMidnightLantern = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const ref = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const T_MINOR = 1.0;
  const t = useRef(0);

  const moths = useMemo(() => [...Array(12)].map(() => ({
    r: 1 + Math.random() * 2, a: Math.random() * Math.PI * 2, y: (Math.random() - 0.5) * 4, s: 2 + Math.random() * 4
  })), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (ref.current) {
      const jitter = broken ? 0 : Math.pow(pre, 4) * 0.4;
      ref.current.position.set(
        (Math.random() - 0.5) * jitter,
        Math.sin(now * 2) * 0.5 + (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter
      );
      ref.current.rotation.y = broken ? now * 0.5 : now * 0.1;
    }
    if (ringRef.current) {
      ringRef.current.scale.setScalar(broken ? 1 + Math.sin(now * 5) * 0.2 : 0.2 + pre * 0.8);
      (ringRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 3 + Math.sin(now * 10) : pre * 2;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        <mesh position={[0, -2, 0]}><cylinderGeometry args={[1.5, 2, 0.5, 8]} /><meshStandardMaterial color="#451a03" metalness={0.8} /></mesh>
        <mesh position={[0, 2, 0]}><cylinderGeometry args={[1.5, 2, 0.5, 8]} /><meshStandardMaterial color="#451a03" metalness={0.8} /></mesh>
        {[...Array(4)].map((_, i) => (
           <mesh key={i} position={[1.5 * Math.cos(i*Math.PI/2), 0, 1.5 * Math.sin(i*Math.PI/2)]}>
             <cylinderGeometry args={[0.1, 0.1, 4, 4]} />
             <meshStandardMaterial color="#78350f" metalness={1} />
           </mesh>
        ))}
        <mesh ref={ringRef}>
           <sphereGeometry args={[1.2, 16, 16]} />
           <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.8} />
        </mesh>
      </group>
      {moths.map((m, i) => (
         <mesh key={`m${i}`} position={[m.r * Math.cos(m.a + t.current*m.s), m.y + Math.sin(t.current*m.s*2)*0.5, m.r * Math.sin(m.a + t.current*m.s)]}>
            <sphereGeometry args={[0.05, 4, 4]} />
            <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={5} />
         </mesh>
      ))}
      <pointLight position={[0, 0, 0]} intensity={40} color={color} distance={50} />
      <Sparkles count={50} scale={15} size={3} speed={2} opacity={0.8} color={color} />
    </group>
  );
};

export const EnvDpsMidnightStar = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  const T_MINOR = 1.2;
  const t = useRef(0);

  const shards = useMemo(() => [...Array(16)].map((_, i) => ({
    a: (i/16)*Math.PI*2, r: Math.random() * 5
  })), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (ref.current) {
      const jitter = broken ? 0 : Math.pow(pre, 5) * 0.6;
      ref.current.position.set((Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter);
      ref.current.rotation.z = broken ? now * 2 : now * 0.5;

      ref.current.children.forEach((child, i) => {
         child.scale.setScalar(broken ? 1 + Math.sin(now * 15 + i)*0.3 : 0.5 + pre*0.5);
      });
    }
    if (flash.current) {
      flash.current.intensity = broken ? 80 + Math.sin(now*20)*20 : pre * 50;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}><octahedronGeometry args={[2, 0]} /><meshStandardMaterial color="#0f172a" emissive={color} emissiveIntensity={2} wireframe /></mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI/4, 0, 0]}><octahedronGeometry args={[2, 0]} /><meshStandardMaterial color="#0f172a" emissive={color} emissiveIntensity={2} wireframe /></mesh>
        <mesh position={[0, 0, 0]} rotation={[0, Math.PI/4, 0]}><octahedronGeometry args={[2, 0]} /><meshStandardMaterial color="#0f172a" emissive={color} emissiveIntensity={2} wireframe /></mesh>
      </group>
      <pointLight ref={flash} position={[0, 0, 0]} color={color} distance={60} />
      {shards.map((s, i) => (
         <mesh key={i} position={[s.r * Math.cos(s.a + t.current), (Math.random()-0.5)*0.5, s.r * Math.sin(s.a + t.current)]}>
            <boxGeometry args={[0.2, 0.2, 0.8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={4} />
         </mesh>
      ))}
      <Stars radius={25} depth={15} count={300} factor={4} saturation={1} fade speed={2} />
    </group>
  );
};

export const EnvDpsMidnightMoon = ({ color }: { color: THREE.Color }) => {
  const moonRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const T_MINOR = 1.5;
  const t = useRef(0);

  const craters = useMemo(() => [...Array(10)].map(() => ({
     x: (Math.random()-0.5)*2, y: (Math.random()-0.5)*2, z: (Math.random()-0.5)*2, s: 0.2 + Math.random()*0.5
  })), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (moonRef.current) {
      const jitter = broken ? 0 : Math.pow(pre, 4) * 0.4;
      moonRef.current.position.set((Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter);
      moonRef.current.rotation.y = broken ? now * 0.8 : now * 0.2;
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = broken ? Math.PI/2 + now*0.5 : Math.PI/2;
      ringRef.current.rotation.y = broken ? now*0.5 : 0;
      (ringRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 4 : pre*2;
      ringRef.current.scale.setScalar(broken ? 1 + Math.sin(now*5)*0.1 : 0.8 + pre*0.2);
    }
  });

  return (
    <group scale={1.5}>
      <mesh ref={moonRef}>
        <sphereGeometry args={[2, 32, 32]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
        {craters.map((c, i) => (
           <mesh key={i} position={[c.x, c.y, c.z]}><sphereGeometry args={[c.s, 8, 8]} /><meshStandardMaterial color="#0f172a" /></mesh>
        ))}
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[3.5, 0.05, 16, 100]} />
        <meshStandardMaterial color={color} emissive={color} />
      </mesh>
      <pointLight position={[-5, 5, 5]} intensity={60} color="#ffffff" distance={50} />
      <pointLight position={[5, -5, -5]} intensity={40} color={color} distance={50} />
      <Sparkles count={100} scale={20} size={4} speed={1} opacity={0.6} color={color} />
    </group>
  );
};

export const EnvDpsMidnightGalaxy = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const coreRef = useRef<THREE.Mesh>(null);
  const spiralRef = useRef<THREE.Group>(null);
  const T_MINOR = 2.0;
  const t = useRef(0);

  const stars = useMemo(() => [...Array(200)].map((_, i) => {
    const a = (i/200) * Math.PI * 10; // spiral
    const r = 1 + (i/200) * 8;
    return { a, r, y: (Math.random()-0.5)*(2 - (i/200)*1.8) };
  }), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (coreRef.current) {
      const jitter = broken ? 0 : Math.pow(pre, 6) * 1.5;
      coreRef.current.position.set((Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter);
      coreRef.current.scale.setScalar(broken ? 1.5 + Math.sin(now*15)*0.3 : 0.1 + pre*0.9);
      (coreRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 10 : pre * 5;
    }

    if (spiralRef.current) {
      spiralRef.current.rotation.y = broken ? -now * 2 : -now * 0.5 * pre;
      spiralRef.current.scale.setScalar(broken ? 1 : pre);

      spiralRef.current.children.forEach((child, i) => {
         if (broken) {
            child.position.y = stars[i].y + Math.sin(now*5 + i*0.1)*0.2;
         }
      });
    }
  });

  return (
    <group scale={1.5}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color={HOT} emissive={HOT} />
      </mesh>
      <group ref={spiralRef}>
         {stars.map((s, i) => (
            <mesh key={i} position={[s.r * Math.cos(s.a), s.y, s.r * Math.sin(s.a)]}>
               <sphereGeometry args={[0.05 + Math.random()*0.1, 4, 4]} />
               <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3 + Math.random()*2} />
            </mesh>
         ))}
      </group>
      <pointLight position={[0, 0, 0]} intensity={150} color={color} distance={150} />
      <Stars radius={50} depth={30} count={1000} factor={6} saturation={1} fade speed={3} />
    </group>
  );
};

export const EnvDpsCompassBronze = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const T_MINOR = 1.0;
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (ref.current) {
      const jitter = broken ? 0 : Math.pow(pre, 3) * 0.3;
      ref.current.position.set((Math.random()-0.5)*jitter, Math.sin(now)*0.5, (Math.random()-0.5)*jitter);
    }
    if (ring1.current && ring2.current) {
      const lockJitter = broken ? 0 : (Math.random()-0.5)*0.2 * pre;
      ring1.current.rotation.x = broken ? now * 1.5 : Math.PI/4 + lockJitter;
      ring2.current.rotation.y = broken ? -now * 2.0 : -Math.PI/4 + lockJitter;

      (ring1.current.material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 2 : pre;
      (ring2.current.material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 2 : pre;
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        <mesh ref={ring1}>
           <torusGeometry args={[3, 0.2, 16, 64]} />
           <meshStandardMaterial color="#78350f" emissive={color} metalness={0.8} />
        </mesh>
        <mesh ref={ring2}>
           <torusGeometry args={[2.5, 0.15, 16, 64]} />
           <meshStandardMaterial color="#451a03" emissive={color} metalness={1} />
        </mesh>
        <mesh position={[0, 0, 0]}>
           <octahedronGeometry args={[1, 0]} />
           <meshStandardMaterial color="#fcd34d" emissive="#f59e0b" emissiveIntensity={1} />
        </mesh>
      </group>
      <pointLight position={[0, 0, 0]} intensity={40} color={color} distance={40} />
      <Sparkles count={40} scale={10} size={2} speed={1} opacity={0.6} color={color} />
    </group>
  );
};

export const EnvDpsCompassSilver = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const T_MINOR = 1.2;
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (ref.current) {
      const jitter = broken ? 0 : Math.pow(pre, 4) * 0.4;
      ref.current.position.set((Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter);
    }
    if (rings.current) {
      rings.current.children.forEach((ring, i) => {
         const lockJitter = broken ? 0 : (Math.random()-0.5)*0.3 * pre;
         const speed = (i%2===0 ? 1 : -1) * (1.5 + i*0.5);
         ring.rotation.x = broken ? now * speed : Math.PI/(i+2) + lockJitter;
         ring.rotation.y = broken ? now * speed * 0.8 : -Math.PI/(i+2) + lockJitter;
         ((ring as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 3 : pre*1.5;
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        <group ref={rings}>
           {[...Array(4)].map((_, i) => (
              <mesh key={i}>
                 <torusGeometry args={[4 - i*0.6, 0.1, 16, 64]} />
                 <meshStandardMaterial color="#0f172a" emissive={color} metalness={0.9} />
              </mesh>
           ))}
        </group>
        <mesh position={[0, 0, 0]}>
           <icosahedronGeometry args={[1.2, 0]} />
           <meshStandardMaterial color="#f8fafc" emissive="#94a3b8" emissiveIntensity={2} wireframe />
        </mesh>
      </group>
      <pointLight position={[0, 0, 0]} intensity={60} color={color} distance={60} />
      <Sparkles count={80} scale={15} size={3} speed={2} opacity={0.7} color={color} />
    </group>
  );
};

export const EnvDpsCompassGold = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  const HOT = "#ffffff";
  const T_MINOR = 1.5;
  const t = useRef(0);

  const runes = useMemo(() => [...Array(24)].map((_, i) => ({
     a: (i/24)*Math.PI*2, r: 4
  })), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (ref.current) {
      const jitter = broken ? 0 : Math.pow(pre, 5) * 0.5;
      ref.current.position.set((Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter);

      ref.current.children.forEach((child, i) => {
         if (i < 24) { // Runes
            child.rotation.y = broken ? now * 3 : now * 0.5;
            child.position.y = broken ? Math.sin(now * 5 + i)*0.5 : 0;
            ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 5 : pre*2;
         }
      });
    }
  });

  return (
    <group scale={1.5}>
      <group ref={ref}>
        {runes.map((r, i) => (
           <mesh key={i} position={[r.r * Math.cos(r.a), 0, r.r * Math.sin(r.a)]} rotation={[0, -r.a, 0]}>
              <boxGeometry args={[0.2, 0.6, 0.1]} />
              <meshStandardMaterial color="#a16207" emissive={color} />
           </mesh>
        ))}
        <mesh rotation={[Math.PI/2, 0, 0]}>
           <torusGeometry args={[4, 0.05, 16, 100]} />
           <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
        </mesh>
        <mesh>
           <octahedronGeometry args={[1.5, 0]} />
           <meshStandardMaterial color="#fef08a" emissive="#eab308" emissiveIntensity={2} />
        </mesh>
      </group>
      <pointLight position={[0, 0, 0]} intensity={80} color={color} distance={80} />
      <Trail width={2} length={20} color={color} attenuation={(t) => t * t}>
         <mesh position={[4, 0, 0]}><sphereGeometry args={[0.2]} /><meshBasicMaterial color={color} /></mesh>
      </Trail>
    </group>
  );
};

export const EnvDpsCompassAstral = ({ color }: { color: THREE.Color }) => {
  const HOT = "#ffffff";
  const coreRef = useRef<THREE.Mesh>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const T_MINOR = 2.0;
  const t = useRef(0);

  const lenses = useMemo(() => [...Array(6)].map((_, i) => ({
    r: 3 + i*0.5, speed: (i%2===0 ? 1 : -1) * (1 + i*0.2)
  })), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const broken = now >= T_MINOR;
    const pre = clamp01(now / T_MINOR);

    if (coreRef.current) {
      const jitter = broken ? 0 : Math.pow(pre, 6) * 0.8;
      coreRef.current.position.set((Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter);
      coreRef.current.rotation.x = broken ? now * 5 : now;
      coreRef.current.scale.setScalar(broken ? 1 + Math.sin(now*15)*0.2 : 0.2 + pre*0.8);
      (coreRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = broken ? 10 : pre*3;
    }
    if (ringsRef.current) {
      ringsRef.current.children.forEach((ring, i) => {
         const lockJitter = broken ? 0 : (Math.random()-0.5)*0.5 * pre;
         ring.rotation.x = broken ? now * lenses[i].speed : Math.PI/3 + lockJitter;
         ring.rotation.y = broken ? now * lenses[i].speed * 1.5 : -Math.PI/3 + lockJitter;
         ring.scale.setScalar(broken ? 1 : pre);
         ((ring as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = broken ? 0.8 : pre*0.5;
      });
    }
  });

  return (
    <group scale={1.8}>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial color={HOT} emissive={HOT} wireframe />
      </mesh>
      <group ref={ringsRef}>
         {lenses.map((l, i) => (
            <mesh key={i}>
               <torusGeometry args={[l.r, 0.05, 16, 100]} />
               <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent />
            </mesh>
         ))}
      </group>
      <pointLight position={[0, 0, 0]} intensity={120} color={color} distance={120} />
      <Sparkles count={200} scale={25} size={6} speed={5} opacity={0.9} color={color} />
      <Stars radius={40} depth={20} count={800} factor={6} saturation={1} fade speed={4} />
    </group>
  );
};

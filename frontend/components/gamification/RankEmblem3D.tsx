"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { cn } from "@/lib/utils";
import { RankBadge } from "./RankBadge";

/**
 * The student's rank as a small 3D medallion.
 *
 * It is built from the existing rank artwork, not a new design: the RankBadge
 * drawing (and its numeral) is rendered underneath exactly as before, then
 * photographed onto a metal relief that has real thickness and catches the
 * light as it turns towards the pointer. So every rank, present and future,
 * gets its medallion automatically and always matches the flat badge.
 *
 * The flat badge stays in the page as the fallback: it is what shows while the
 * medallion is being prepared, on devices without WebGL, on touch-only phones
 * and when the visitor has asked for reduced motion.
 *
 * The medallion lives in its own square slot. Nothing is ever drawn over or
 * behind it, and it only animates while it is on screen.
 */
export function RankEmblem3D({ tier, className }: { tier: string; className?: string }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    const canvas = canvasRef.current;
    if (!slot || !canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduced || !finePointer) return;

    // Ask the browser first, on a throwaway canvas, whether it has a graphics
    // chip to draw with. A computer that would draw 3D in software keeps the
    // flat badge and never pays for preparing the medallion at all.
    // (__mp3d lets the test suite opt in.)
    if (!(window as unknown as { __mp3d?: boolean }).__mp3d) {
      try {
        const probe = document.createElement("canvas");
        const options = { failIfMajorPerformanceCaveat: true };
        const gl = (probe.getContext("webgl2", options) || probe.getContext("webgl", options)) as WebGLRenderingContext | null;
        if (!gl) return;
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return;
      } catch {
        return;
      }
    }

    let disposed = false;
    let cleanup = () => {};

    const start = async () => {
      // 1. Photograph the existing badge (its SVG plus the numeral drawn over it).
      const svg = slot.querySelector("svg");
      if (!svg) return;
      const SIZE = 1024;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(SIZE));
      clone.setAttribute("height", String(SIZE));
      clone.removeAttribute("class");
      clone.removeAttribute("style");
      // The drawing's own painted shadows are left out: the medallion casts a real one.
      clone.querySelectorAll("[filter]").forEach((node) => {
        if ((node.getAttribute("filter") || "").includes("blur")) node.remove();
        else node.removeAttribute("filter");
      });
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
      try {
        await image.decode();
      } catch {
        return;
      }
      if (disposed) return;

      const art = document.createElement("canvas");
      art.width = art.height = SIZE;
      const ctx = art.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, SIZE, SIZE);

      const numeralEl = slot.querySelector<HTMLElement>("[data-rank-numeral]");
      if (numeralEl?.textContent) {
        const slotSize = slot.getBoundingClientRect().width || 128;
        const numeralStyle = getComputedStyle(numeralEl);
        const fontPx = (parseFloat(numeralStyle.fontSize) || 36) * (SIZE / slotSize);
        ctx.font = `900 ${fontPx}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.75)";
        ctx.shadowBlur = fontPx * 0.12;
        ctx.shadowOffsetY = fontPx * 0.06;
        ctx.fillStyle = numeralStyle.color || "#fef3c7";
        ctx.fillText(numeralEl.textContent, SIZE / 2, SIZE / 2 + fontPx * 0.04);
        ctx.shadowColor = "transparent";
      }

      // 2. Turn the drawing's light and dark into relief (a normal map).
      const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data;
      const height = new Float32Array(SIZE * SIZE);
      for (let i = 0; i < SIZE * SIZE; i++) {
        const a = pixels[i * 4 + 3] / 255;
        const lum = (pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114) / 255;
        height[i] = a * (0.35 + lum * 0.65);
      }
      const normals = new Uint8ClampedArray(SIZE * SIZE * 4);
      const at = (x: number, y: number) => height[Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const dx = (at(x + 3, y) - at(x - 3, y)) * 3.4;
          const dy = (at(x, y + 3) - at(x, y - 3)) * 3.4;
          const inv = 1 / Math.hypot(dx, dy, 1);
          const o = (y * SIZE + x) * 4;
          normals[o] = (-dx * inv * 0.5 + 0.5) * 255;
          normals[o + 1] = (dy * inv * 0.5 + 0.5) * 255;
          normals[o + 2] = (inv * 0.5 + 0.5) * 255;
          normals[o + 3] = 255;
        }
      }
      const normalCanvas = document.createElement("canvas");
      normalCanvas.width = normalCanvas.height = SIZE;
      normalCanvas.getContext("2d")?.putImageData(new ImageData(normals, SIZE, SIZE), 0, 0);

      // 3. The medallion.
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        return;
      }
      // Computers that draw 3D in software (no graphics chip) keep the flat badge:
      // it would cost them real effort for no gain. (__mp3d lets the test suite opt in.)
      const testHooks = window as unknown as { __mp3d?: boolean; __mp3dStill?: { x: number; y: number } };
      try {
        const gl = renderer.getContext();
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        if (!testHooks.__mp3d && /swiftshader|llvmpipe|software|basic render/i.test(name)) {
          renderer.dispose();
          return;
        }
      } catch {
        // If the renderer cannot be identified, carry on.
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
      scene.environment = environment;

      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
      camera.position.set(0, 0, 3.05);

      const faceMap = new THREE.CanvasTexture(art);
      faceMap.colorSpace = THREE.SRGBColorSpace;
      faceMap.anisotropy = 8;
      faceMap.generateMipmaps = true;
      const normalMap = new THREE.CanvasTexture(normalCanvas);

      const plane = new THREE.PlaneGeometry(1.36, 1.36);
      const face = new THREE.Mesh(
        plane,
        new THREE.MeshStandardMaterial({
          map: faceMap,
          normalMap,
          normalScale: new THREE.Vector2(1.5, 1.5),
          metalness: 0.72,
          roughness: 0.34,
          envMapIntensity: 1.25,
          alphaTest: 0.5,
          alphaToCoverage: true,
        }),
      );

      // Thickness: the silhouette repeated behind the face as a dark metal edge.
      const LAYERS = 12;
      const DEPTH = 0.11;
      const edge = new THREE.InstancedMesh(
        plane,
        new THREE.MeshStandardMaterial({ map: faceMap, color: 0x6b5140, metalness: 0.85, roughness: 0.45, envMapIntensity: 0.9, alphaTest: 0.5, alphaToCoverage: true }),
        LAYERS,
      );
      const layer = new THREE.Object3D();
      for (let i = 0; i < LAYERS; i++) {
        layer.position.set(0, 0, -((i + 1) / LAYERS) * DEPTH);
        layer.updateMatrix();
        edge.setMatrixAt(i, layer.matrix);
      }
      const back = new THREE.Mesh(
        plane,
        new THREE.MeshStandardMaterial({ map: faceMap, color: 0x3a2c22, metalness: 0.8, roughness: 0.5, alphaTest: 0.5, alphaToCoverage: true, side: THREE.BackSide }),
      );
      back.position.z = -DEPTH;

      const medal = new THREE.Group();
      medal.add(face, edge, back);
      scene.add(medal);

      const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
      key.position.set(-1.6, 2.2, 2.4);
      const rim = new THREE.DirectionalLight(0xffb057, 1.1);
      rim.position.set(2.2, -1.2, 1.2);
      scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.35));

      const fit = () => {
        const box = slot.getBoundingClientRect();
        const side = Math.max(1, Math.round(Math.min(box.width, box.height)));
        renderer.setSize(side, side, false);
      };
      fit();

      // 4. Motion: a slow sway, and a turn towards the pointer while it is nearby.
      const target = { x: 0, y: 0 };
      const now = { x: 0, y: 0 };
      const onPointer = (event: PointerEvent) => {
        const box = slot.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const reach = 520;
        target.x = Math.max(-1, Math.min(1, (event.clientX - cx) / reach));
        target.y = Math.max(-1, Math.min(1, (event.clientY - cy) / reach));
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      let frame = 0;
      let visible = true;
      let last = performance.now();
      const tick = (time: number) => {
        frame = 0;
        const dt = Math.min(0.05, (time - last) / 1000);
        last = time;
        now.x += (target.x - now.x) * Math.min(1, dt * 5);
        now.y += (target.y - now.y) * Math.min(1, dt * 5);
        const t = time / 1000;
        medal.rotation.y = now.x * 0.62 + Math.sin(t * 0.7) * 0.16;
        medal.rotation.x = now.y * 0.5 + Math.sin(t * 0.53 + 1.3) * 0.07;
        key.position.x = -1.6 + Math.sin(t * 0.45) * 1.4;
        renderer.render(scene, camera);
        if (visible && !document.hidden) frame = requestAnimationFrame(tick);
      };
      const wake = () => {
        if (testHooks.__mp3dStill) return;
        if (!frame && visible && !document.hidden) {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }
      };
      const observer = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        wake();
      });
      observer.observe(slot);
      const resize = new ResizeObserver(fit);
      resize.observe(slot);
      document.addEventListener("visibilitychange", wake);

      if (testHooks.__mp3dStill) {
        // Test suite: one still frame in a given pose, no animation.
        medal.rotation.set(testHooks.__mp3dStill.y, testHooks.__mp3dStill.x, 0);
        renderer.render(scene, camera);
        setLive(true);
      } else {
        renderer.render(scene, camera);
        setLive(true);
        wake();
      }

      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onPointer);
        document.removeEventListener("visibilitychange", wake);
        observer.disconnect();
        resize.disconnect();
        plane.dispose();
        [face, back].forEach((mesh) => (mesh.material as THREE.Material).dispose());
        (edge.material as THREE.Material).dispose();
        faceMap.dispose();
        normalMap.dispose();
        environment.dispose();
        pmrem.dispose();
        renderer.dispose();
      };
      if (disposed) cleanup();
    };

    void start();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [tier]);

  return (
    <div ref={slotRef} className={cn("se-emblem relative", className)} data-live={live ? "true" : "false"}>
      <RankBadge tier={tier} size="md" className="se-emblem-flat" />
      <canvas ref={canvasRef} className="se-emblem-canvas" aria-hidden="true" />
    </div>
  );
}

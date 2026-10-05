"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createLoginStage } from "./_stage/controller";
import type { LoginStageController } from "./_stage/controller";
import type { LoginRole, StageSignal } from "./_stage/shared";

export type LoginStageHandle = {
  Signal: (Kind: StageSignal) => void;
  HoldForTyping: () => void;
};

type LoginStageProps = {
  Role: LoginRole;
  Dark: boolean;
  Headline: string;
  Description: string;
  OnCelebrate: () => void;
};

// The stage half of the sign-in page: one hero per role (a student's abacus, a teacher's class, an
// admin's institution) and its title card. React owns the headline and description; everything that
// moves (the scene, the live readout, the challenge) is driven by the stage controller, which never
// touches authentication. The elements the controller writes to are rendered once, with no children
// and no changing props, so React and the controller never fight over them.
const LoginStage = forwardRef<LoginStageHandle, LoginStageProps>(function LoginStage(
  { Role, Dark, Headline, Description, OnCelebrate },
  Ref
) {
  const StageRef = useRef<HTMLElement>(null);
  const SlotRef = useRef<HTMLDivElement>(null);
  const CanvasRef = useRef<HTMLCanvasElement>(null);
  const FlatRef = useRef<HTMLDivElement>(null);
  const LineRef = useRef<HTMLDivElement>(null);
  const BigRef = useRef<HTMLDivElement>(null);
  const ChallengeButtonRef = useRef<HTMLButtonElement>(null);
  const ChallengeBarRef = useRef<HTMLSpanElement>(null);
  const HintRef = useRef<HTMLSpanElement>(null);
  const ControllerRef = useRef<LoginStageController | null>(null);
  const CelebrateRef = useRef(OnCelebrate);
  const InitialRef = useRef({ Role, Dark });

  CelebrateRef.current = OnCelebrate;

  useEffect(() => {
    const Stage = StageRef.current;
    const Slot = SlotRef.current;
    const Canvas = CanvasRef.current;
    const Flat = FlatRef.current;
    const Line = LineRef.current;
    const Big = BigRef.current;
    const ChallengeButton = ChallengeButtonRef.current;
    const ChallengeBar = ChallengeBarRef.current;
    const Hint = HintRef.current;
    if (!Stage || !Slot || !Canvas || !Flat || !Line || !Big || !ChallengeButton || !ChallengeBar || !Hint) return;

    const Controller = createLoginStage(
      {
        stage: Stage,
        slot: Slot,
        canvas: Canvas,
        flat: Flat,
        line: Line,
        big: Big,
        challengeButton: ChallengeButton,
        challengeBar: ChallengeBar,
        hint: Hint,
      },
      {
        role: InitialRef.current.Role,
        dark: InitialRef.current.Dark,
        onCelebrate: () => CelebrateRef.current(),
      }
    );
    ControllerRef.current = Controller;

    return () => {
      ControllerRef.current = null;
      Controller.destroy();
    };
  }, []);

  useEffect(() => {
    InitialRef.current.Role = Role;
    ControllerRef.current?.setRole(Role);
  }, [Role]);

  useEffect(() => {
    InitialRef.current.Dark = Dark;
    ControllerRef.current?.setDark(Dark);
  }, [Dark]);

  useImperativeHandle(
    Ref,
    () => ({
      Signal: (Kind) => ControllerRef.current?.signal(Kind),
      HoldForTyping: () => ControllerRef.current?.holdForTyping(),
    }),
    []
  );

  return (
    <section className="mp-si-stage" ref={StageRef} data-testid="login-story-panel" aria-label="MathPath">
      <canvas className="mp-si-gl" ref={CanvasRef} aria-hidden="true" hidden />
      <div className="mp-si-slot" ref={SlotRef}>
        <div className="mp-si-flat" ref={FlatRef} aria-hidden="true" />
      </div>
      <div className="mp-si-title" data-testid="login-story-content">
        <h1 className="mp-si-headline mp-si-swap" key={`headline-${Role}`} data-testid="login-story-headline">
          {Headline}
        </h1>
        <div className="mp-si-challenge">
          <span className="mp-si-bar" ref={ChallengeBarRef} hidden>
            <i />
          </span>
          <button type="button" className="mp-si-chal" ref={ChallengeButtonRef}>
            Try a challenge
          </button>
        </div>
        <div className="mp-si-readout" aria-hidden="true">
          <div className="mp-si-ro-line" ref={LineRef} />
          <div className="mp-si-ro-big" ref={BigRef} />
        </div>
        <div className="mp-si-sub">
          <p className="mp-si-desc mp-si-swap" key={`description-${Role}`} data-testid="login-story-description">
            {Description}
          </p>
          <span className="mp-si-hint" ref={HintRef} />
        </div>
      </div>
    </section>
  );
});

export default LoginStage;

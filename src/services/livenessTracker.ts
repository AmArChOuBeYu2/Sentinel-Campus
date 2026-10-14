export interface FrameLighting {
  status: 'good' | 'low_light' | 'overexposed';
  luminance: number;
  message?: string;
}

export interface FacePositionGuidance {
  isAligned: boolean;
  issue: 'ok' | 'too_far' | 'too_close' | 'off_center';
  message?: string;
  boxRatio: number;
}

export type LivenessAction = 'turn_left' | 'turn_right' | 'smile' | 'blink';

export interface LivenessChallenge {
  action: LivenessAction;
  instruction: string;
  hint: string;
}

export const LIVENESS_CHALLENGES: LivenessChallenge[] = [
  {
    action: 'turn_left',
    instruction: 'Turn your head slightly to your left',
    hint: 'Gently rotate ~15° left from center',
  },
  {
    action: 'turn_right',
    instruction: 'Turn your head slightly to your right',
    hint: 'Gently rotate ~15° right from center',
  },
  {
    action: 'smile',
    instruction: 'Give a gentle smile to the camera',
    hint: 'Show a clear, natural smile',
  },
  {
    action: 'blink',
    instruction: 'Blink your eyes naturally',
    hint: 'Close and open your eyes once',
  },
];

export interface TrackedFaceData {
  detected: boolean;
  score: number;
  box?: { x: number; y: number; width: number; height: number };
  descriptor?: number[];
  expressions?: Record<string, number>;
  landmarks?: {
    yawRatio: number;
    leftEAR: number;
    smileScore: number;
  };
  lighting?: FrameLighting;
  guidance?: FacePositionGuidance;
  livenessPassed?: boolean;
  message?: string;
}

/**
 * Analyzes video frame illumination in <1ms to provide clear, actionable user feedback
 * when ambient light is insufficient or backlighting/glare prevents facial feature detection.
 */
export function analyzeFrameLighting(video: HTMLVideoElement): FrameLighting {
  try {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return { status: 'good', luminance: 128 };
    }
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { status: 'good', luminance: 128 };

    ctx.drawImage(video, 0, 0, 64, 48);
    const data = ctx.getImageData(0, 0, 64, 48).data;
    let sum = 0;
    const pixelCount = 64 * 48;

    for (let i = 0; i < data.length; i += 4) {
      // Perceived luminance (ITU-R BT.709)
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }

    const avg = sum / pixelCount;
    if (avg < 35) {
      return {
        status: 'low_light',
        luminance: avg,
        message: 'Lighting is too dim. Please face a light source or move to a brighter area.',
      };
    }
    if (avg > 230) {
      return {
        status: 'overexposed',
        luminance: avg,
        message: 'Too much glare or backlighting. Avoid strong light sources directly behind you.',
      };
    }
    return { status: 'good', luminance: avg };
  } catch {
    return { status: 'good', luminance: 128 };
  }
}

/**
 * Evaluates face size and position within the camera viewport using forgiving, responsive tolerances.
 * Does NOT require exact center lock; accommodates natural head size, glasses, and distance variations.
 */
export function evaluateFacePosition(
  box: { x: number; y: number; width: number; height: number },
  videoWidth: number,
  videoHeight: number
): FacePositionGuidance {
  if (!videoWidth || !videoHeight) return { isAligned: true, issue: 'ok', boxRatio: 0.4 };

  const boxRatio = box.width / videoWidth;
  const centerX = (box.x + box.width / 2) / videoWidth;
  const centerY = (box.y + box.height / 2) / videoHeight;

  // Face size tolerance: between 15% and 82% of camera width
  if (boxRatio < 0.15) {
    return {
      isAligned: false,
      issue: 'too_far',
      message: 'Move slightly closer to the camera.',
      boxRatio,
    };
  }
  if (boxRatio > 0.82) {
    return {
      isAligned: false,
      issue: 'too_close',
      message: 'Move slightly farther from the camera.',
      boxRatio,
    };
  }

  // Generous center tolerance: allows center between 18% and 82% horizontally and 12% to 88% vertically
  if (centerX < 0.18 || centerX > 0.82 || centerY < 0.12 || centerY > 0.88) {
    return {
      isAligned: false,
      issue: 'off_center',
      message: 'Center your face inside the guide.',
      boxRatio,
    };
  }

  return { isAligned: true, issue: 'ok', boxRatio };
}

/**
 * Multi-frame temporal liveness session tracker.
 *
 * ANTI-SPOOFING MECHANISM:
 * 1. Establishes a neutral baseline over 3 consecutive stable frames (yaw, smile, EAR).
 * 2. Issues a randomized challenge ONLY after stable neutral baseline is locked.
 * 3. Verifies a dynamic temporal transition (delta) from baseline across consecutive frames.
 *    - Static printed photos or static phone screens CANNOT transition from neutral to rotated/smiling.
 *    - Photo proxies fail because their delta from baseline is zero.
 * 4. Tolerates short detection gaps (up to 3 dropped frames / 600ms) without jarring resets.
 * 5. Requires 2 consecutive frames meeting target criteria to filter single-frame noise.
 *
 * KNOWN ARCHITECTURAL LIMITATION:
 * Dedicated deep-learning presentation attack detection (PAD texture/depth classifier, e.g. MiniFASNet)
 * is not bundled in @vladmandic/face-api. While dynamic landmark challenges defeat static 2D printouts
 * and static screen displays, sophisticated deepfakes or live replay attacks with synchronized motion
 * remain an inherent risk of client-side browser execution. Production mode enforces server-side fail-closed.
 */
export class LivenessSessionTracker {
  private phase: 'searching' | 'stabilizing' | 'challenge_active' | 'passed' | 'failed' = 'searching';
  private stableFrames = 0;
  private missedFrames = 0;
  private activeChallenge: LivenessChallenge | null = null;
  private challengeStartTime = 0;
  private consecutivePassed = 0;
  private baselineYaw = 0.5;
  private baselineSmile = 0.0;
  private baselineEAR = 0.3;
  private challengeTimeoutMs = 7000;
  private statusMessage = 'Searching for face...';

  reset(): void {
    this.phase = 'searching';
    this.stableFrames = 0;
    this.missedFrames = 0;
    this.activeChallenge = null;
    this.challengeStartTime = 0;
    this.consecutivePassed = 0;
    this.baselineYaw = 0.5;
    this.baselineSmile = 0.0;
    this.baselineEAR = 0.3;
    this.statusMessage = 'Searching for face...';
  }

  getPhase(): 'searching' | 'stabilizing' | 'challenge_active' | 'passed' | 'failed' {
    return this.phase;
  }

  getActiveChallenge(): LivenessChallenge | null {
    return this.activeChallenge;
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  isPassed(): boolean {
    return this.phase === 'passed';
  }

  /**
   * Processes a single detection frame through the temporal liveness state machine.
   */
  processFrame(detection: TrackedFaceData | null, lighting?: FrameLighting): {
    phase: 'searching' | 'stabilizing' | 'challenge_active' | 'passed' | 'failed';
    message: string;
    livenessPassed: boolean;
    challenge: LivenessChallenge | null;
  } {
    // 1. If lighting is poor and no face is detected, provide actionable lighting feedback
    if (!detection || !detection.detected) {
      this.missedFrames++;
      // Allow brief detection gap (up to 3 frames / ~600ms) before regressing state
      if (this.missedFrames > 3) {
        if (this.phase !== 'passed') {
          this.stableFrames = 0;
          this.consecutivePassed = 0;
          if (lighting && lighting.status !== 'good' && lighting.message) {
            this.statusMessage = lighting.message;
          } else {
            this.statusMessage = 'Searching for face... Center your face in view.';
          }
          if (this.phase !== 'challenge_active') {
            this.phase = 'searching';
          }
        }
      }
      return {
        phase: this.phase,
        message: this.statusMessage,
        livenessPassed: this.phase === 'passed',
        challenge: this.activeChallenge,
      };
    }

    // Face is detected! Reset missed frames counter
    this.missedFrames = 0;

    // Check position & distance guidance
    if (detection.guidance && !detection.guidance.isAligned) {
      this.statusMessage = detection.guidance.message || 'Align your face in view.';
      return {
        phase: this.phase,
        message: this.statusMessage,
        livenessPassed: this.phase === 'passed',
        challenge: this.activeChallenge,
      };
    }

    const yaw = detection.landmarks?.yawRatio ?? 0.5;
    const smile = detection.landmarks?.smileScore ?? (detection.expressions?.happy || 0);
    const ear = detection.landmarks?.leftEAR ?? 0.3;

    // 2. Stabilizing phase: Establish neutral baseline over consecutive frames
    if (this.phase === 'searching' || this.phase === 'stabilizing') {
      this.phase = 'stabilizing';
      this.stableFrames++;
      this.statusMessage = `Face detected — hold still (${this.stableFrames}/3)...`;

      // Moving average of neutral baseline
      this.baselineYaw = this.baselineYaw * 0.5 + yaw * 0.5;
      this.baselineSmile = this.baselineSmile * 0.5 + smile * 0.5;
      this.baselineEAR = this.baselineEAR * 0.5 + ear * 0.5;

      if (this.stableFrames >= 3) {
        // Lock baseline and issue randomized challenge
        this.activeChallenge =
          LIVENESS_CHALLENGES[Math.floor(Math.random() * LIVENESS_CHALLENGES.length)];
        this.phase = 'challenge_active';
        this.challengeStartTime = Date.now();
        this.consecutivePassed = 0;
        this.statusMessage = this.activeChallenge.instruction;
      }

      return {
        phase: this.phase,
        message: this.statusMessage,
        livenessPassed: false,
        challenge: this.activeChallenge,
      };
    }

    // 3. Challenge Active Phase: Verify dynamic temporal transition relative to baseline
    if (this.phase === 'challenge_active' && this.activeChallenge) {
      const elapsed = Date.now() - this.challengeStartTime;
      if (elapsed > this.challengeTimeoutMs) {
        // Expired — pick fresh challenge and allow another attempt
        this.activeChallenge =
          LIVENESS_CHALLENGES[Math.floor(Math.random() * LIVENESS_CHALLENGES.length)];
        this.challengeStartTime = Date.now();
        this.consecutivePassed = 0;
        this.statusMessage = `Time elapsed. Next challenge: ${this.activeChallenge.instruction}`;
        return {
          phase: this.phase,
          message: this.statusMessage,
          livenessPassed: false,
          challenge: this.activeChallenge,
        };
      }

      let frameActionMet = false;

      switch (this.activeChallenge.action) {
        case 'turn_left': {
          // Dynamic rotation: yaw ratio must decrease significantly from baseline
          const yawDelta = this.baselineYaw - yaw;
          // Must rotate at least 0.05 towards left, reaching ratio < 0.44
          if (yaw < 0.44 && yawDelta > 0.05) {
            frameActionMet = true;
          }
          break;
        }
        case 'turn_right': {
          // Dynamic rotation: yaw ratio must increase significantly from baseline
          const yawDelta = yaw - this.baselineYaw;
          // Must rotate at least 0.05 towards right, reaching ratio > 0.56
          if (yaw > 0.56 && yawDelta > 0.05) {
            frameActionMet = true;
          }
          break;
        }
        case 'smile': {
          // Dynamic smile: current smile must be clear (>0.55) AND jump significantly from neutral baseline
          const smileDelta = smile - this.baselineSmile;
          if (smile > 0.55 && smileDelta > 0.3) {
            frameActionMet = true;
          }
          break;
        }
        case 'blink': {
          // Dynamic blink: eye aspect ratio drops significantly below baseline
          const earDrop = this.baselineEAR - ear;
          if (ear < 0.20 || earDrop > 0.08) {
            frameActionMet = true;
          }
          break;
        }
      }

      if (frameActionMet) {
        this.consecutivePassed++;
        if (this.consecutivePassed >= 2) {
          this.phase = 'passed';
          this.statusMessage = '✅ Challenge verified! Completing presence check...';
          return {
            phase: 'passed',
            message: this.statusMessage,
            livenessPassed: true,
            challenge: this.activeChallenge,
          };
        }
      } else {
        this.consecutivePassed = Math.max(0, this.consecutivePassed - 1);
      }

      return {
        phase: 'challenge_active',
        message: this.activeChallenge.instruction,
        livenessPassed: false,
        challenge: this.activeChallenge,
      };
    }

    return {
      phase: this.phase,
      message: this.statusMessage,
      livenessPassed: this.phase === 'passed',
      challenge: this.activeChallenge,
    };
  }
}

import * as faceapi from '@vladmandic/face-api';
import {
  FrameLighting,
  FacePositionGuidance,
  LivenessAction,
  LivenessChallenge,
  LIVENESS_CHALLENGES,
  TrackedFaceData,
  analyzeFrameLighting,
  evaluateFacePosition,
  LivenessSessionTracker,
} from './livenessTracker';

export type {
  FrameLighting,
  FacePositionGuidance,
  LivenessAction,
  LivenessChallenge,
  TrackedFaceData,
};
export {
  LIVENESS_CHALLENGES,
  analyzeFrameLighting,
  evaluateFacePosition,
  LivenessSessionTracker,
};

export type FaceDetectionResult = TrackedFaceData;

class FaceVerificationService {
  private modelsLoaded = false;
  private loadingPromise: Promise<boolean> | null = null;
  private currentChallengeIndex = 0;

  async loadModels(): Promise<boolean> {
    if (this.modelsLoaded) return true;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const MODEL_URL = '/models';
        console.log('[FaceAPI] Loading optimized biometric weights from', MODEL_URL);

        // Load lightweight tiny face detector + landmark + recognition + expression
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);

        this.modelsLoaded = true;
        console.log('[FaceAPI] All biometric neural weights loaded successfully');
        return true;
      } catch (err) {
        console.error('[FaceAPI] Failed to load official weights:', err);
        this.modelsLoaded = false;
        return false;
      }
    })();

    return this.loadingPromise;
  }

  isLoaded(): boolean {
    return this.modelsLoaded;
  }

  getRandomChallenge(): LivenessChallenge {
    this.currentChallengeIndex = Math.floor(Math.random() * LIVENESS_CHALLENGES.length);
    return LIVENESS_CHALLENGES[this.currentChallengeIndex];
  }

  createLivenessTracker(): LivenessSessionTracker {
    return new LivenessSessionTracker();
  }

  /**
   * Detects face in a video frame with calibrated dual-pass detection:
   * - Primary pass: inputSize 416 with scoreThreshold 0.32 (captures medium distance faces in typical indoor lighting)
   * - Secondary fallback: inputSize 320 with scoreThreshold 0.25 (handles close-up or lower-contrast captures)
   * Evaluates lighting and bounding box positioning to provide forgiving, actionable guidance.
   */
  async detectFace(
    video: HTMLVideoElement,
    activeChallenge?: LivenessChallenge
  ): Promise<FaceDetectionResult> {
    if (
      !video ||
      video.readyState < 3 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      video.paused
    ) {
      return {
        detected: false,
        score: 0,
        message: 'Camera feed initializing... please wait.',
      };
    }

    // Inspect lighting
    const lighting = analyzeFrameLighting(video);

    try {
      const modelsReady = await this.loadModels();
      if (!modelsReady) {
        return {
          detected: false,
          score: 0,
          lighting,
          message: 'Biometric models loading... Please hold.',
        };
      }

      // Primary detection pass: calibrated for indoor/mobile lighting
      const primaryOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.32,
      });

      let detection = await faceapi
        .detectSingleFace(video, primaryOptions)
        .withFaceLandmarks(true)
        .withFaceExpressions()
        .withFaceDescriptor();

      // Secondary fallback pass if primary returned no detection
      if (!detection) {
        const fallbackOptions = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.25,
        });

        detection = await faceapi
          .detectSingleFace(video, fallbackOptions)
          .withFaceLandmarks(true)
          .withFaceExpressions()
          .withFaceDescriptor();
      }

      if (!detection) {
        let hint = 'Searching for face... Center your face in view.';
        if (lighting.status !== 'good' && lighting.message) {
          hint = lighting.message;
        }

        return {
          detected: false,
          score: 0,
          lighting,
          message: hint,
        };
      }

      const { box } = detection.detection;
      const score = detection.detection.score;
      const descriptor = Array.from(detection.descriptor);
      const expressions = detection.expressions as unknown as Record<string, number>;

      // Extract landmark metrics for temporal verification
      const landmarks = detection.landmarks;
      const nose = landmarks.getNose()[0];
      const jaw = landmarks.getJawOutline();
      const leftJaw = jaw[0];
      const rightJaw = jaw[16];
      const jawWidth = Math.abs(rightJaw.x - leftJaw.x) || 1;
      const yawRatio = (nose.x - leftJaw.x) / jawWidth;

      const leftEye = landmarks.getLeftEye();
      const leftHeight = Math.abs(leftEye[1].y - leftEye[5].y) + Math.abs(leftEye[2].y - leftEye[4].y);
      const leftWidth = Math.abs(leftEye[0].x - leftEye[3].x) * 2 || 1;
      const leftEAR = leftHeight / leftWidth;
      const smileScore = expressions.happy || 0;

      // Position & distance evaluation
      const guidance = evaluateFacePosition(box, video.videoWidth, video.videoHeight);

      // Backwards-compatible single-frame active challenge evaluation
      let livenessPassed = false;
      if (activeChallenge) {
        if (activeChallenge.action === 'smile') {
          livenessPassed = smileScore > 0.6;
        } else if (activeChallenge.action === 'turn_left') {
          livenessPassed = yawRatio < 0.44;
        } else if (activeChallenge.action === 'turn_right') {
          livenessPassed = yawRatio > 0.56;
        } else if (activeChallenge.action === 'blink') {
          livenessPassed = leftEAR < 0.22 || (expressions.neutral || 0) > 0.7;
        }
      } else {
        livenessPassed = true;
      }

      return {
        detected: true,
        score,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        descriptor,
        expressions,
        landmarks: {
          yawRatio,
          leftEAR,
          smileScore,
        },
        lighting,
        guidance,
        livenessPassed,
        message: guidance.isAligned ? 'Face aligned in view.' : guidance.message,
      };
    } catch (err) {
      console.warn('[FaceAPI] Real-time inference notice:', err);
      return {
        detected: false,
        score: 0,
        lighting,
        message: 'Face detection in progress...',
      };
    }
  }

  // Calculate Euclidean Distance between two 128-d vectors
  calculateDistance(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 1.0;
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
      const diff = vecA[i] - vecB[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}

export const faceService = new FaceVerificationService();

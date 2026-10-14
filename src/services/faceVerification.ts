import * as faceapi from '@vladmandic/face-api';

export interface FaceDetectionResult {
  detected: boolean;
  score: number;
  box?: { x: number; y: number; width: number; height: number };
  descriptor?: number[];
  expressions?: Record<string, number>;
  livenessPassed?: boolean;
  message?: string;
}

export type LivenessAction = 'blink' | 'turn_left' | 'turn_right' | 'smile';

export interface LivenessChallenge {
  action: LivenessAction;
  instruction: string;
  hint: string;
}

const LIVENESS_CHALLENGES: LivenessChallenge[] = [
  {
    action: 'blink',
    instruction: 'Please blink both eyes naturally',
    hint: 'Close and open your eyes once',
  },
  {
    action: 'turn_left',
    instruction: 'Turn your head slightly to your left',
    hint: 'Gently rotate your head ~15° left',
  },
  {
    action: 'turn_right',
    instruction: 'Turn your head slightly to your right',
    hint: 'Gently rotate your head ~15° right',
  },
  {
    action: 'smile',
    instruction: 'Give a gentle smile to the camera',
    hint: 'Ensure your smile is visible',
  },
];

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
        console.log('[FaceAPI] Loading local models from', MODEL_URL);

        // Load lightweight tiny face detector or ssdMobilenetv1
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);

        this.modelsLoaded = true;
        console.log('[FaceAPI] All models loaded successfully');
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

  async detectFace(
    video: HTMLVideoElement,
    activeChallenge?: LivenessChallenge
  ): Promise<FaceDetectionResult> {
    if (!video || video.readyState < 2) {
      return { detected: false, score: 0, message: 'Camera feed not ready' };
    }

    try {
      await this.loadModels();

      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5,
      });

      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceExpressions()
        .withFaceDescriptor();

      if (!detection) {
        return {
          detected: false,
          score: 0,
          message: 'No face detected in frame. Please center your face inside the guide.',
        };
      }

      const { box } = detection.detection;
      const score = detection.detection.score;
      const descriptor = Array.from(detection.descriptor);
      const expressions = detection.expressions as unknown as Record<string, number>;

      let livenessPassed = false;

      // Active liveness evaluation
      if (activeChallenge) {
        if (activeChallenge.action === 'smile') {
          livenessPassed = (expressions.happy || 0) > 0.65;
        } else if (activeChallenge.action === 'turn_left') {
          // Check landmarks: nose position relative to jaw boundary
          const landmarks = detection.landmarks;
          const nose = landmarks.getNose()[0];
          const jaw = landmarks.getJawOutline();
          const leftJaw = jaw[0];
          const rightJaw = jaw[16];
          const ratio = (nose.x - leftJaw.x) / (rightJaw.x - leftJaw.x);
          livenessPassed = ratio < 0.42; // rotated towards left
        } else if (activeChallenge.action === 'turn_right') {
          const landmarks = detection.landmarks;
          const nose = landmarks.getNose()[0];
          const jaw = landmarks.getJawOutline();
          const leftJaw = jaw[0];
          const rightJaw = jaw[16];
          const ratio = (nose.x - leftJaw.x) / (rightJaw.x - leftJaw.x);
          livenessPassed = ratio > 0.58; // rotated towards right
        } else if (activeChallenge.action === 'blink') {
          // Check eye landmarks
          const leftEye = detection.landmarks.getLeftEye();
          const rightEye = detection.landmarks.getRightEye();
          // Eye Aspect Ratio approx
          const leftHeight = Math.abs(leftEye[1].y - leftEye[5].y) + Math.abs(leftEye[2].y - leftEye[4].y);
          const leftWidth = Math.abs(leftEye[0].x - leftEye[3].x) * 2;
          const leftEAR = leftHeight / (leftWidth || 1);
          livenessPassed = leftEAR < 0.22 || expressions.neutral > 0.7; // Blink or sustained gaze
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
        livenessPassed,
        message: 'Face verified in view.',
      };
    } catch (err) {
      console.error('[FaceAPI] Real-time inference error:', err);
      return {
        detected: false,
        score: 0,
        message: 'Face verification inference failed: ' + (err instanceof Error ? err.message : String(err)),
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

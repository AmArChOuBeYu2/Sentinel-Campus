import path from 'path';
import fs from 'fs';
import { db, calculateEuclideanDistance } from '../db';
import { UserProfile } from '../types';

export interface AuthorizedReferenceProfile {
  userId: string;
  expectedName: string;
  expectedRole: 'student' | 'teacher' | 'staff' | 'admin';
  referenceImageFileName: string;
  referenceStatus: 'trusted_genuine' | 'ineligible_ai_generated' | 'provisional_unverified';
  ineligibilityReason?: string;
  adminVerificationRequired: boolean;
}

export const AUTHORIZED_REFERENCE_REGISTRY: Record<string, AuthorizedReferenceProfile> = {
  usr_stu_0001: {
    userId: 'usr_stu_0001',
    expectedName: 'Krishna Jha',
    expectedRole: 'student',
    referenceImageFileName: 'krishna_usr_stu_0001.jpeg',
    referenceStatus: 'trusted_genuine',
    adminVerificationRequired: false,
  },
  usr_sta_0001: {
    userId: 'usr_sta_0001',
    expectedName: 'Sudhanshu Kumar',
    expectedRole: 'staff',
    referenceImageFileName: 'sudhanshu_usr_sta_0001.jpeg',
    referenceStatus: 'trusted_genuine',
    adminVerificationRequired: false,
  },
  usr_tch_0001: {
    userId: 'usr_tch_0001',
    expectedName: 'Amar Choubey',
    expectedRole: 'teacher',
    referenceImageFileName: 'amar_usr_tch_0001.png',
    referenceStatus: 'ineligible_ai_generated',
    ineligibilityReason:
      'Reference image is AI-generated (Amar.png). Ineligible for automatic biometric enrollment until verified in-person by an administrator.',
    adminVerificationRequired: true,
  },
  usr_sta_0002: {
    userId: 'usr_sta_0002',
    expectedName: 'Chetan',
    expectedRole: 'staff',
    referenceImageFileName: 'chetan_usr_sta_0002.jpeg',
    referenceStatus: 'trusted_genuine',
    adminVerificationRequired: false,
  },
  usr_sta_0003: {
    userId: 'usr_sta_0003',
    expectedName: 'Campus Staff Specialist',
    expectedRole: 'staff',
    referenceImageFileName: 'staff3_usr_sta_0003.jpeg',
    referenceStatus: 'trusted_genuine',
    adminVerificationRequired: false,
  },
};

export class ReferenceIdentityService {
  private storageDir: string;

  constructor() {
    this.storageDir = path.resolve(process.cwd(), 'server', 'storage', 'reference-images');
  }

  getReferenceProfile(userId: string): AuthorizedReferenceProfile | null {
    return AUTHORIZED_REFERENCE_REGISTRY[userId] || null;
  }

  hasAuthorizedReferenceImage(userId: string): boolean {
    const profile = this.getReferenceProfile(userId);
    if (!profile) return false;
    const fullPath = path.join(this.storageDir, profile.referenceImageFileName);
    return fs.existsSync(fullPath);
  }

  validateEnrollmentCandidate(
    targetUser: UserProfile,
    candidateDescriptor: number[],
    options?: { isAdminSession?: boolean; adminBypassKey?: string }
  ): { valid: boolean; error?: string; code?: string; matchedOtherUser?: string } {
    const profile = this.getReferenceProfile(targetUser.id);

    // 1. Ineligible AI-generated or uncertain reference check
    if (profile && profile.referenceStatus === 'ineligible_ai_generated') {
      if (!options?.isAdminSession) {
        return {
          valid: false,
          code: 'AI_REFERENCE_INELIGIBLE',
          error:
            profile.ineligibilityReason ||
            'Reference image is AI-generated and ineligible to serve as biometric identity ground truth. Explicit administrator verification is required.',
        };
      }
    }

    // 2. Cross-Identity Collision Check: Candidate face must NOT match another person's enrolled profile
    const allActiveEnrollments = db
      .getEnrollments()
      .filter((e) => e.userId !== targetUser.id && e.isActive && Array.isArray(e.descriptor));

    for (const otherEnrollment of allActiveEnrollments) {
      const crossDist = calculateEuclideanDistance(otherEnrollment.descriptor, candidateDescriptor);
      if (crossDist <= 0.55) {
        const otherUser = db.getUserById(otherEnrollment.userId);
        const otherName = otherUser ? otherUser.fullName : otherEnrollment.userId;
        const otherRole = otherUser ? otherUser.role.toUpperCase() : 'USER';

        return {
          valid: false,
          code: 'CROSS_IDENTITY_ENROLLMENT_MISMATCH',
          matchedOtherUser: otherName,
          error: `Cross-identity enrollment rejected: The presented face matches registered profile ${otherName} (${otherRole}) with distance ${crossDist.toFixed(
            3
          )} <= 0.55. You cannot enroll another person's facial biometric identity under this account.`,
        };
      }
    }

    return { valid: true };
  }
}

export const referenceIdentityService = new ReferenceIdentityService();

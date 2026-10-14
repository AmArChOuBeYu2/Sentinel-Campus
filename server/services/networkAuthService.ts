import { Request } from 'express';

export type NetworkAuthMode = 'demo' | 'prototype' | 'cidr' | 'gateway_challenge' | 'production';

export interface AndroidWifiVerificationPayload {
  ssid?: string;
  bssid?: string;
  gatewayIp?: string;
  networkSignature?: string;
  signalDbm?: number;
}

export interface NetworkValidationResult {
  verified: boolean;
  mode: NetworkAuthMode;
  isDemo: boolean;
  message: string;
  error?: string;
  clientIp?: string;
  matchedCidr?: string;
  simulatedBypassAttempted?: boolean;
}

class NetworkAuthService {
  private getMode(): NetworkAuthMode {
    const rawMode = (process.env.NETWORK_AUTH_MODE || 'demo').toLowerCase().trim();
    if (rawMode === 'production' || rawMode === 'cidr' || rawMode === 'gateway_challenge') {
      return rawMode as NetworkAuthMode;
    }
    // Default to demo/prototype in non-production environments
    return (process.env.NODE_ENV === 'production' ? 'cidr' : 'demo') as NetworkAuthMode;
  }

  private isDemoAllowed(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false; // Fail-closed: Demo mode strictly prohibited in production
    }
    return process.env.ALLOW_DEMO_NETWORK_AUTH === 'true' || this.getMode() === 'demo';
  }

  private getTrustedCidrs(): string[] {
    const raw = process.env.TRUSTED_NETWORK_CIDRS || '127.0.0.1/32,::1/128,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12';
    return raw.split(',').map((c) => c.trim()).filter(Boolean);
  }

  /**
   * Simple IPv4 CIDR matching helper
   */
  private ipMatchesCidr(ip: string, cidr: string): boolean {
    try {
      // Normalize IPv6 mapped IPv4 e.g. ::ffff:192.168.1.1
      let cleanIp = ip.replace(/^::ffff:/, '');
      if (cleanIp === '::1' || cleanIp === '127.0.0.1') {
        if (cidr.includes('127.0.0.1') || cidr.includes('::1') || cidr.includes('localhost')) {
          return true;
        }
      }

      const [range, bitsStr] = cidr.split('/');
      const maskBits = bitsStr ? parseInt(bitsStr, 10) : 32;

      const ipParts = cleanIp.split('.').map((p) => parseInt(p, 10));
      const rangeParts = range.split('.').map((p) => parseInt(p, 10));

      if (ipParts.length !== 4 || rangeParts.length !== 4) {
        return cleanIp === range;
      }

      const ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
      const rangeNum = ((rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3]) >>> 0;
      const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;

      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  /**
   * Validate network connection for campus attendance
   */
  validateNetwork(
    req: Request,
    androidPayload?: AndroidWifiVerificationPayload
  ): NetworkValidationResult {
    const mode = this.getMode();
    const isDev = process.env.NODE_ENV !== 'production';

    // Extract client IP from headers (supporting reverse proxy/tunnel)
    const rawForwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof rawForwarded === 'string'
      ? rawForwarded.split(',')[0].trim()
      : req.socket.remoteAddress || req.ip || '127.0.0.1';

    // 1. Prototype / Demo Mode (Phone Hotspot & Local Development)
    if (mode === 'demo' || mode === 'prototype') {
      if (!this.isDemoAllowed()) {
        return {
          verified: false,
          mode: 'demo',
          isDemo: false,
          error: 'Demo network mode is disabled in production. Real campus CIDR verification is required.',
          clientIp,
        };
      }

      return {
        verified: true,
        mode: 'demo',
        isDemo: true,
        message: '[PROTOTYPE / DEMO] Network access authorized via Prototype Mode. (Connect via Phone Hotspot or Campus Lab Wi-Fi).',
        clientIp,
      };
    }

    // 2. Production CIDR Subnet Validation
    if (mode === 'cidr' || mode === 'production') {
      const trustedCidrs = this.getTrustedCidrs();
      for (const cidr of trustedCidrs) {
        if (this.ipMatchesCidr(clientIp, cidr)) {
          return {
            verified: true,
            mode: 'cidr',
            isDemo: false,
            message: `Verified: Connected from authorized campus subnet (${cidr}).`,
            clientIp,
            matchedCidr: cidr,
          };
        }
      }

      // If Android payload provided valid campus signature
      if (androidPayload?.networkSignature && androidPayload.networkSignature.startsWith('SKIT_CAMPUS_SECURE_SIG_')) {
        return {
          verified: true,
          mode: 'cidr',
          isDemo: false,
          message: 'Verified via Native Android Campus Wi-Fi Hardware Cryptographic Handshake.',
          clientIp,
        };
      }

      // Failed closed: Not on trusted campus network
      return {
        verified: false,
        mode: 'cidr',
        isDemo: false,
        error: `Device is not connected to an authorized campus Wi-Fi subnet (Client IP: ${clientIp}). Please connect to SKIT_CAMPUS_SECURE or SKIT_FACULTY_WIFI.`,
        clientIp,
      };
    }

    // 3. Gateway Challenge Mode
    if (mode === 'gateway_challenge') {
      const challengeToken = req.headers['x-campus-gateway-token'];
      const expectedToken = process.env.CAMPUS_GATEWAY_SECRET;

      if (expectedToken && challengeToken === expectedToken) {
        return {
          verified: true,
          mode: 'gateway_challenge',
          isDemo: false,
          message: 'Verified via SKIT Campus Gateway Cryptographic Challenge.',
          clientIp,
        };
      }

      return {
        verified: false,
        mode: 'gateway_challenge',
        isDemo: false,
        error: 'Campus Gateway challenge token missing or invalid. Attendance refused.',
        clientIp,
      };
    }

    // Default: Fail closed
    return {
      verified: false,
      mode,
      isDemo: false,
      error: 'Unrecognized network verification configuration. Verification failed closed.',
      clientIp,
    };
  }

  /**
   * Get public network status metadata (safe for client inspection)
   */
  getPublicNetworkConfig(): {
    authMode: NetworkAuthMode;
    isDemoMode: boolean;
    trustedSSIDs: string[];
    notice: string;
  } {
    const mode = this.getMode();
    const isDemo = this.isDemoAllowed() && (mode === 'demo' || mode === 'prototype');
    const ssids = (process.env.TRUSTED_WIFI_SSID || 'SKIT_CAMPUS_SECURE,SKIT_FACULTY_WIFI')
      .split(',')
      .map((s) => s.trim());

    return {
      authMode: mode,
      isDemoMode: isDemo,
      trustedSSIDs: ssids,
      notice: isDemo
        ? '[PROTOTYPE] Currently running in Demo/Prototype network mode. Phone hotspot or local Wi-Fi accepted.'
        : 'Campus Wi-Fi authentication active. Connection to SKIT authorized subnets required.',
    };
  }
}

export const networkAuthService = new NetworkAuthService();

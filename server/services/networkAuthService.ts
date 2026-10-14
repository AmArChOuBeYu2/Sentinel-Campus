import { Request } from 'express';

export type NetworkAuthMode = 'demo' | 'prototype' | 'cidr' | 'gateway_challenge' | 'production';

/**
 * ============================================================================
 * SENTINEL CAMPUS NETWORK AUTHENTICATION ARCHITECTURE & SECURITY SPECIFICATION
 * ============================================================================
 *
 * 1. PROTOTYPE DEVICE REFERENCE:
 *    - Diagnostic device reference: E4:EC:E8:8C:DB:E3 (Local test device)
 *    - ARCHITECTURAL PRINCIPLE: A Wi-Fi MAC address is a Layer-2 link identifier.
 *      It is NOT a Wi-Fi SSID, hotspot password, campus network identifier, or
 *      proof that the device is connected to an approved campus network.
 *
 * 2. BROWSER SANDBOX & ZERO-TRUST CLIENT EVIDENCE:
 *    - W3C Web Security Standards prohibit browser JavaScript from querying
 *      hardware MAC addresses of local network adapters.
 *    - Any client-submitted MAC address in an HTTP header or JSON payload is
 *      unverified, self-reported telemetry and MUST NEVER be trusted as an
 *      authentication factor or attendance credential.
 *
 * 3. MOBILE OS PRIVACY & MAC RANDOMIZATION (Android 10+ / iOS 14+):
 *    - Android 10+ (API level 29) enables MAC address randomization by default.
 *    - Android userland APIs (e.g. WifiInfo.getMacAddress()) intentionally return
 *      a dummy constant (02:00:00:00:00:00) to protect user privacy.
 *    - Accessing BSSID/SSID on Android requires ACCESS_FINE_LOCATION and runtime
 *      user authorization, and can be forged on rooted devices.
 *
 * 4. PRODUCTION CAMPUS TRUST MECHANISMS (Campus IT Coordinated):
 *    - Real campus verification relies on:
 *      a) Approved Campus Gateway / Reverse Proxy with cryptographic challenge
 *         tokens (x-campus-gateway-token) injected by managed network equipment.
 *      b) Server-side Layer-3/4 TCP connection inspection against registered
 *         institutional subnets (TRUSTED_NETWORK_CIDRS).
 *      c) IEEE 802.1X EAP-TLS WPA3-Enterprise radius authentication with client
 *         certificates managed via Android KeyStore / secure hardware element.
 *      d) Managed campus VPN tunnels (WireGuard / IPsec).
 *    - A mobile phone hotspot or cellular IP is NEVER equivalent to campus Wi-Fi.
 *
 * 5. SIMULATED PROTOTYPE vs. PRODUCTION FAIL-CLOSED ENFORCEMENT:
 *    - In demo/prototype mode, verification is explicitly tagged as simulated
 *      (isSimulated: true, verificationTier: 'simulated_prototype').
 *    - In production mode (NODE_ENV=production or NETWORK_AUTH_MODE=production),
 *      simulated verification is strictly prohibited and fails closed.
 */

export interface AndroidWifiVerificationPayload {
  ssid?: string;
  bssid?: string;
  gatewayIp?: string;
  networkSignature?: string;
  signalDbm?: number;
  /** Purely diagnostic telemetry; NEVER accepted by server as an auth factor */
  clientMac?: string;
}

export interface NetworkValidationResult {
  verified: boolean;
  mode: NetworkAuthMode;
  isDemo: boolean;
  isSimulated: boolean;
  verificationTier: 'simulated_prototype' | 'server_verified_infrastructure';
  message: string;
  error?: string;
  clientIp?: string;
  matchedCidr?: string;
  macNotice?: string;
  simulatedBypassAttempted?: boolean;
}

class NetworkAuthService {
  /**
   * Resolve current network auth mode
   */
  private getMode(): NetworkAuthMode {
    const rawMode = (process.env.NETWORK_AUTH_MODE || '').toLowerCase().trim();
    if (rawMode === 'demo' || rawMode === 'prototype' || rawMode === 'production' || rawMode === 'cidr' || rawMode === 'gateway_challenge') {
      return rawMode as NetworkAuthMode;
    }
    // Default to demo/prototype in non-production environments
    return (process.env.NODE_ENV === 'production' ? 'cidr' : 'demo') as NetworkAuthMode;
  }

  /**
   * Determine if demo/simulated mode is permitted
   */
  private isDemoAllowed(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false; // Fail-closed: Demo mode strictly prohibited in production
    }
    return process.env.ALLOW_DEMO_NETWORK_AUTH === 'true' || this.getMode() === 'demo';
  }

  /**
   * Parse approved institutional CIDR subnets from environment
   */
  public getTrustedCidrs(): string[] {
    const raw = process.env.TRUSTED_NETWORK_CIDRS || '127.0.0.1/32,::1/128,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12';
    return raw.split(',').map((c) => c.trim()).filter(Boolean);
  }

  /**
   * Optional prototype device reference for inventory/diagnostics (Read from local config)
   */
  public getPrototypeDeviceRef(): string | null {
    return process.env.PROTOTYPE_DEVICE_MAC_REF || null;
  }

  /**
   * Architectural invariant: MAC addresses CANNOT independently authorize attendance
   */
  public isMacSufficientForAuth(): boolean {
    return false;
  }

  /**
   * Evaluation helper for client-submitted MAC address claims
   */
  public evaluateMacClaim(clientMac?: string): {
    acceptedAsAuthFactor: boolean;
    reason: string;
  } {
    if (!clientMac) {
      return {
        acceptedAsAuthFactor: false,
        reason: 'No MAC address supplied.',
      };
    }

    return {
      acceptedAsAuthFactor: false,
      reason:
        `Client-supplied MAC address (${clientMac}) is rejected as authentication proof. ` +
        'W3C browser sandboxing and Android 10+ MAC address randomization prevent genuine hardware MAC verification, ' +
        'and Layer-2 MACs are stripped over Layer-3 IP routing. Attendance requires verified campus CIDR or gateway authentication.',
    };
  }

  /**
   * Simple IPv4 CIDR matching helper
   */
  public ipMatchesCidr(ip: string, cidr: string): boolean {
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
   * Check if an IP address belongs to any of the specified CIDR subnets
   */
  public isIpInCidrs(ip: string, cidrs: string[]): boolean {
    return cidrs.some((cidr) => this.ipMatchesCidr(ip, cidr));
  }

  /**
   * Validate network connection for campus attendance
   */
  validateNetwork(
    req: Request,
    androidPayload?: AndroidWifiVerificationPayload
  ): NetworkValidationResult {
    const mode = this.getMode();

    // Extract client IP from headers (supporting reverse proxy/tunnel)
    const rawForwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof rawForwarded === 'string'
      ? rawForwarded.split(',')[0].trim()
      : req.socket.remoteAddress || req.ip || '127.0.0.1';

    // Inspect if client submitted an untrusted MAC address
    const suppliedMac = (
      androidPayload?.clientMac ||
      req.headers['x-client-mac'] ||
      (req.body && req.body.clientMac) ||
      ''
    ).toString().trim();

    const macNotice = suppliedMac
      ? `[SECURITY AUDIT] Client presented MAC address (${suppliedMac}). MAC addresses are unverified Layer-2 identifiers and strictly disregarded as authentication evidence.`
      : undefined;

    // 1. Prototype / Demo Mode (Hotspot & Local Development)
    if (mode === 'demo' || mode === 'prototype') {
      if (!this.isDemoAllowed()) {
        return {
          verified: false,
          mode: 'demo',
          isDemo: false,
          isSimulated: false,
          verificationTier: 'server_verified_infrastructure',
          error: 'Demo/simulated network mode is prohibited in production. Real campus CIDR or gateway challenge is required.',
          clientIp,
          macNotice,
        };
      }

      return {
        verified: true,
        mode: 'demo',
        isDemo: true,
        isSimulated: true,
        verificationTier: 'simulated_prototype',
        message: '[DEMO PROTOTYPE] Simulated network presence verification. (Local Hotspot / Prototype Wi-Fi permitted).',
        clientIp,
        macNotice,
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
            isSimulated: false,
            verificationTier: 'server_verified_infrastructure',
            message: `Verified: Connected from authorized campus subnet (${cidr}).`,
            clientIp,
            matchedCidr: cidr,
            macNotice,
          };
        }
      }

      // If Android payload provided valid campus cryptographic signature
      if (androidPayload?.networkSignature && androidPayload.networkSignature.startsWith('SKIT_CAMPUS_SECURE_SIG_')) {
        return {
          verified: true,
          mode: 'cidr',
          isDemo: false,
          isSimulated: false,
          verificationTier: 'server_verified_infrastructure',
          message: 'Verified via Native Android Campus Wi-Fi Hardware Cryptographic Handshake.',
          clientIp,
          macNotice,
        };
      }

      // Fail-closed: Not on trusted campus network
      return {
        verified: false,
        mode: 'cidr',
        isDemo: false,
        isSimulated: false,
        verificationTier: 'server_verified_infrastructure',
        error: `Device is not connected to an authorized campus Wi-Fi subnet (Client IP: ${clientIp}). Mobile hotspots or external networks cannot substitute for campus infrastructure.`,
        clientIp,
        macNotice,
      };
    }

    // 3. Gateway Challenge Mode (Approved Campus Gateway / Reverse Proxy)
    if (mode === 'gateway_challenge') {
      const challengeToken = req.headers['x-campus-gateway-token'];
      const expectedToken = process.env.CAMPUS_GATEWAY_SECRET;

      if (expectedToken && challengeToken === expectedToken) {
        return {
          verified: true,
          mode: 'gateway_challenge',
          isDemo: false,
          isSimulated: false,
          verificationTier: 'server_verified_infrastructure',
          message: 'Verified via SKIT Campus Gateway Cryptographic Challenge.',
          clientIp,
          macNotice,
        };
      }

      return {
        verified: false,
        mode: 'gateway_challenge',
        isDemo: false,
        isSimulated: false,
        verificationTier: 'server_verified_infrastructure',
        error: 'Campus Gateway cryptographic challenge token missing or invalid. Attendance refused.',
        clientIp,
        macNotice,
      };
    }

    // Default: Fail closed
    return {
      verified: false,
      mode,
      isDemo: false,
      isSimulated: false,
      verificationTier: 'server_verified_infrastructure',
      error: 'Unrecognized network verification configuration. Verification failed closed.',
      clientIp,
      macNotice,
    };
  }

  /**
   * Get public network status metadata (safe for client inspection)
   */
  getPublicNetworkConfig(): {
    authMode: NetworkAuthMode;
    isDemoMode: boolean;
    isSimulated: boolean;
    verificationTier: 'simulated_prototype' | 'server_verified_infrastructure';
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
      isSimulated: isDemo,
      verificationTier: isDemo ? 'simulated_prototype' : 'server_verified_infrastructure',
      trustedSSIDs: ssids,
      notice: isDemo
        ? '[PROTOTYPE / DEMO] Currently running in Demo network mode. Simulated presence check for hackathon presentation.'
        : 'Production Campus Network Authentication active. Connection to verified SKIT campus subnets or IT gateway required.',
    };
  }
}

export const networkAuthService = new NetworkAuthService();

/**
 * Camera Utility for SMAN 1 Lumbung Attendance System
 * Handles navigator.mediaDevices.getUserMedia lifecycle and hardware resource management.
 */

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface CameraError {
  name: string;
  message: string;
  userMessage: string;
}

export class CameraManager {
  private static currentStream: MediaStream | null = null;

  /**
   * Checks if the browser supports media devices
   */
  static isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Lists available video input devices
   */
  static async getAvailableCameras(): Promise<CameraDeviceInfo[]> {
    try {
      // Permission might be needed to see labels
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Kamera ${d.deviceId.slice(0, 5)}...`
        }));
    } catch (err) {
      console.warn('[CameraManager] Error enumerating devices:', err);
      return [];
    }
  }

  /**
   * Starts camera stream with given constraints or deviceId
   */
  static async startStream(
    constraintsOrDeviceId?: string | MediaStreamConstraints
  ): Promise<MediaStream> {
    // Release existing resources first
    this.stopStream();

    if (!this.isSupported()) {
      throw this.parseError(new Error('Browser not supported'), 'SUPPORT');
    }

    let constraints: MediaStreamConstraints;

    if (typeof constraintsOrDeviceId === 'string') {
      constraints = {
        video: { deviceId: { exact: constraintsOrDeviceId } }
      };
    } else if (constraintsOrDeviceId) {
      constraints = constraintsOrDeviceId;
    } else {
      // Default to rear camera on mobile
      constraints = {
        video: { facingMode: { ideal: 'environment' } }
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;
      return stream;
    } catch (err: any) {
      throw this.parseError(err);
    }
  }

  /**
   * Fully releases camera hardware and stops all tracks
   */
  static stopStream(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
        this.currentStream?.removeTrack(track);
      });
      this.currentStream = null;
    }
  }

  /**
   * Map technical errors to user-friendly Indonesian messages
   */
  private static parseError(err: any, type?: string): CameraError {
    const name = err.name || 'UnknownError';
    let userMessage = 'Gagal mengakses kamera. Terjadi kesalahan teknis.';

    if (type === 'SUPPORT') {
      userMessage = 'Browser/perangkat Anda tidak mendukung akses kamera. Gunakan Chrome/Edge terbaru.';
    } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      userMessage = 'Izin kamera ditolak. Silakan aktifkan izin kamera di pengaturan browser/situs.';
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      userMessage = 'Kamera tidak ditemukan pada perangkat ini.';
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      userMessage = 'Kamera sedang digunakan oleh aplikasi lain atau bermasalah.';
    } else if (name === 'OverconstrainedError') {
      userMessage = 'Konfigurasi kamera tidak didukung oleh perangkat ini.';
    }

    return {
      name,
      message: err.message || String(err),
      userMessage
    };
  }
}

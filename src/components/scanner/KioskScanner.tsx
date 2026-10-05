import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { StorageService } from '../../services/storage';
import { soundFx } from '../../services/audio';
import { ScanResult, AttendanceRecord, Student } from '../../types';
import { ScanFeedback } from './ScanFeedback';
import {
  QrCode,
  CreditCard,
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  History,
  Zap,
  Radio,
  LogIn,
  RefreshCw,
  Keyboard,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import { TopAttendanceList } from '../dashboard/TopAttendanceList';
import { CameraManager, CameraDeviceInfo } from './cameraUtils';

interface KioskScannerProps {
  isKioskFullscreen?: boolean;
  onCloseKiosk?: () => void;
  students?: Student[];
  attendances?: AttendanceRecord[];
}

type KioskMode = 'DUAL' | 'RFID' | 'QR';

export const KioskScanner: React.FC<KioskScannerProps> = ({
  isKioskFullscreen = false,
  onCloseKiosk,
  students = [],
  attendances = []
}) => {
  // Core States
  const [kioskMode, setKioskMode] = useState<KioskMode>('DUAL');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [recentScans, setRecentScans] = useState<AttendanceRecord[]>([]);

  // Camera States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>('');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  // Manual Input States
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualToken, setManualToken] = useState('');

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanFrameIdRef = useRef<number | null>(null);
  const keyBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(Date.now());

  // --- DATA HELPERS ---
  const refreshRecentScans = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const all = StorageService.getAttendances();
    const todayRecords = all.filter(a => a.date === today).slice(0, 10);
    setRecentScans(todayRecords);
  }, []);

  const triggerAudioFeedback = useCallback((result: ScanResult) => {
    if (soundMuted) return;
    switch (result.type) {
      case 'HADIR':
        soundFx.playSuccess();
        break;
      case 'TERLAMBAT':
        soundFx.playWarning();
        break;
      case 'DUPLICATE':
        soundFx.playInfo();
        break;
      case 'NOT_FOUND':
      case 'ERROR':
        soundFx.playError();
        break;
    }
  }, [soundMuted]);

  const processCode = useCallback(async (code: string, method: 'RFID' | 'QR' | 'MANUAL') => {
    if (isProcessing) return;
    const clean = code.trim();
    if (!clean) return;

    setIsProcessing(true);
    setScanResult(null);

    // Artificial delay for better UX and validation feeling
    await new Promise(r => setTimeout(r, 400));

    try {
      const result = StorageService.processScan(clean, method, 'Kiosk Scanner');
      setScanResult(result);
      triggerAudioFeedback(result);
      refreshRecentScans();

      // Lock for 3 seconds after success/fail to prevent multiple reads
      setTimeout(() => {
        setIsProcessing(false);
        // Clear scan result after some time to reset the UI feedback
        setTimeout(() => setScanResult(null), 5000);
      }, 3000);
    } catch (err) {
      console.error('Process code error:', err);
      setIsProcessing(false);
    }
  }, [isProcessing, triggerAudioFeedback, refreshRecentScans]);

  // --- RFID LISTENER ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (kioskMode === 'QR') return;
      if (showManualInput) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 150) {
        keyBufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 3) {
          processCode(keyBufferRef.current, 'RFID');
          keyBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        keyBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    refreshRecentScans();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processCode, kioskMode, showManualInput, refreshRecentScans]);

  // --- CAMERA MANAGEMENT ---
  const stopCamera = useCallback(() => {
    if (scanFrameIdRef.current) {
      cancelAnimationFrame(scanFrameIdRef.current);
      scanFrameIdRef.current = null;
    }
    CameraManager.stopStream();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const enumerateCameras = useCallback(async () => {
    const devices = await CameraManager.getAvailableCameras();
    setAvailableCameras(devices);
    return devices;
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setIsCameraLoading(true);
    setCameraError(null);

    try {
      const stream = await CameraManager.startStream(deviceId);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.error("Video play error:", e);
        }
      }

      setIsCameraActive(true);
      setIsCameraLoading(false);

      // Identify active camera
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        const settings = tracks[0].getSettings();
        if (settings.deviceId) {
          setActiveCameraId(settings.deviceId);
        }
      }

      // Start scan loop
      requestAnimationFrame(scanLoop);

      // Refresh camera list (permissions might have just been granted)
      enumerateCameras();
    } catch (err: any) {
      console.error('Camera start error:', err);
      setIsCameraLoading(false);
      setCameraError(err.userMessage || 'Gagal mengakses kamera.');
    }
  }, [stopCamera, enumerateCameras]);

  const scanLoop = useCallback(() => {
    if (!isCameraActive || isProcessing || !videoRef.current || !canvasRef.current) {
      scanFrameIdRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        processCode(code.data, 'QR');
      }
    }

    scanFrameIdRef.current = requestAnimationFrame(scanLoop);
  }, [isCameraActive, isProcessing, processCode]);

  const switchCamera = useCallback(() => {
    if (availableCameras.length < 2) return;
    
    setIsSwitchingCamera(true);
    const currentIndex = availableCameras.findIndex(c => c.deviceId === activeCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[nextIndex];
    
    startCamera(nextCamera.deviceId).finally(() => {
      setIsSwitchingCamera(false);
    });
  }, [availableCameras, activeCameraId, startCamera]);

  // --- LIFECYCLE ---
  useEffect(() => {
    if (kioskMode === 'QR' || kioskMode === 'DUAL') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [kioskMode, startCamera, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualToken) {
      processCode(manualToken, 'MANUAL');
      setManualToken('');
      setShowManualInput(false);
    }
  };

  return (
    <div className={`flex flex-col gap-6 ${isKioskFullscreen ? 'p-6 bg-slate-50 text-slate-900 min-h-screen' : ''}`}>
      {/* Kiosk Mode Top Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight">
                Layar Kiosk Presensi SMAN 1 Lumbung
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Pindai Kartu RFID atau QR Code untuk mencatat kehadiran harian
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundMuted(!soundMuted)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                soundMuted
                  ? 'bg-slate-100 text-slate-500 border-slate-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{soundMuted ? 'Suara Muted' : 'Suara Aktif'}</span>
            </button>

            {isKioskFullscreen && onCloseKiosk && (
              <button
                onClick={onCloseKiosk}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                <span>Login Admin</span>
              </button>
            )}
          </div>
        </div>

        {/* KIOSK SCANNING MODE SELECTOR MENU */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-600" />
            <span>Mode Scanner:</span>
          </span>

          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
            <button
              type="button"
              onClick={() => setKioskMode('RFID')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
                kioskMode === 'RFID'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>RFID Card</span>
            </button>

            <button
              type="button"
              onClick={() => setKioskMode('QR')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
                kioskMode === 'QR'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Kamera QR</span>
            </button>

            <button
              type="button"
              onClick={() => setKioskMode('DUAL')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
                kioskMode === 'DUAL'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Dual (RFID + QR)</span>
            </button>
          </div>
        </div>
      </div>

      {/* RESULT FEEDBACK OVERLAY */}
      <ScanFeedback result={scanResult} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            
            {/* LARGE SCANNER AREA */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-[400px]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">Area Pemindaian QR Code</h3>
                </div>
                
                <div className="flex items-center gap-2">
                  {availableCameras.length > 1 && isCameraActive && (
                    <button
                      onClick={switchCamera}
                      disabled={isSwitchingCamera}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
                      <span>Ganti Kamera</span>
                    </button>
                  )}
                  
                  <button
                    onClick={() => setShowManualInput(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-bold transition-all"
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>Input Token Manual</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-slate-900 relative flex items-center justify-center overflow-hidden min-h-[300px]">
                {/* Hidden canvas for jsQR */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Video Preview */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${(kioskMode === 'RFID') ? 'hidden' : ''}`}
                />

                {/* RFID Active Indicator */}
                {kioskMode === 'RFID' && (
                  <div className="text-center space-y-4 animate-fade-in">
                    <div className="w-20 h-20 rounded-full bg-indigo-500/20 border-2 border-indigo-400 flex items-center justify-center mx-auto">
                      <CreditCard className="w-10 h-10 text-indigo-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-white font-bold">RFID Standby</p>
                      <p className="text-slate-400 text-xs">Tempelkan kartu pada reader USB</p>
                    </div>
                  </div>
                )}

                {/* Camera UI Overlays */}
                {(kioskMode === 'QR' || kioskMode === 'DUAL') && (
                  <>
                    {/* Scanning Animation */}
                    {isCameraActive && !isProcessing && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-[15%] border-2 border-emerald-500/30 rounded-3xl">
                          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
                          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
                          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
                          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
                          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-emerald-500/50 animate-scan-line shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                        </div>
                      </div>
                    )}

                    {/* Camera Error / Loading states */}
                    {isCameraLoading && (
                      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                        <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
                        <p className="text-white font-bold">Menghubungkan Kamera...</p>
                      </div>
                    )}

                    {cameraError && (
                      <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-8 text-center space-y-6">
                        <div className="p-4 rounded-3xl bg-rose-500/10 border border-rose-500/20">
                          <CameraOff className="w-12 h-12 text-rose-500" />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-white text-lg font-black tracking-tight">Kamera tidak dapat digunakan</h4>
                          <p className="text-slate-400 text-sm max-w-[280px] leading-relaxed mx-auto">
                            {cameraError}
                          </p>
                        </div>
                        <div className="flex flex-col w-full max-w-[240px] gap-3">
                          <button
                            onClick={() => startCamera()}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Coba Lagi
                          </button>
                          <button
                            onClick={() => setKioskMode('RFID')}
                            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl border border-slate-700 transition-all active:scale-95"
                          >
                            Gunakan Scanner RFID
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Processing State */}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                        <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-white animate-spin mb-4" />
                        <p className="text-white font-black text-xl tracking-tight">Memproses Presensi...</p>
                        <p className="text-white/60 text-sm mt-1 font-medium">Jangan pindahkan kartu/perangkat</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Bottom Instructions */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Arahkan QR Code ke tengah kotak hijau</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Camera {isCameraActive ? 'ON' : 'OFF'}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${kioskMode !== 'QR' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`} />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">RFID {kioskMode !== 'QR' ? 'ACTIVE' : 'IDLE'}</span>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
           <TopAttendanceList 
             students={students}
             attendances={attendances}
             limit={5}
             title="Top Prestasi"
           />
           
           <div className="mt-6 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                 <AlertCircle className="w-5 h-5" />
               </div>
               <h3 className="text-sm font-bold text-slate-900">Bantuan Scan</h3>
             </div>
             <ul className="space-y-3 text-xs text-slate-600 font-medium">
               <li className="flex gap-2">
                 <span className="text-indigo-600 font-bold">•</span>
                 <span>Pastikan kartu bersih dan tidak terlipat</span>
               </li>
               <li className="flex gap-2">
                 <span className="text-indigo-600 font-bold">•</span>
                 <span>Posisikan QR sekitar 10-15cm dari kamera</span>
               </li>
               <li className="flex gap-2">
                 <span className="text-indigo-600 font-bold">•</span>
                 <span>Gunakan pencahayaan ruangan yang cukup</span>
               </li>
               <li className="flex gap-2">
                 <span className="text-indigo-600 font-bold">•</span>
                 <span>Jika kamera bermasalah, gunakan input manual</span>
               </li>
             </ul>
           </div>
        </div>
      </div>

      {/* Stream of Recent Scans Today */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Riwayat Scan Terbaru Hari Ini</h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono font-semibold uppercase tracking-wider">
            {recentScans.length} Record Terakhir
          </span>
        </div>

        {recentScans.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center font-medium">Belum ada aktivitas scan hari ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-bold">
                  <th className="py-2.5 px-3">Jam</th>
                  <th className="py-2.5 px-3">Identitas Siswa</th>
                  <th className="py-2.5 px-3">Kelas</th>
                  <th className="py-2.5 px-3">Metode</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium">
                {recentScans.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-indigo-700">{r.time}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{r.studentName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">NIS: {r.nis}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold">
                        {r.className}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        {r.method === 'RFID' ? <CreditCard className="w-3 h-3" /> : r.method === 'QR' ? <QrCode className="w-3 h-3" /> : <Keyboard className="w-3 h-3" />}
                        <span className="text-[10px] font-bold">{r.method}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {r.status === 'HADIR' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          HADIR
                        </span>
                      )}
                      {r.status === 'TERLAMBAT' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          TERLAMBAT ({r.lateMinutes}m)
                        </span>
                      )}
                      {(r.status === 'SAKIT' || r.status === 'IZIN') && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                          {r.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MANUAL TOKEN INPUT MODAL */}
      {showManualInput && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-md w-full p-8 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <Keyboard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Input Token Manual</h3>
                  <p className="text-xs text-slate-500 font-medium">Gunakan jika kamera bermasalah</p>
                </div>
              </div>
              <button
                onClick={() => setShowManualInput(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-widest ml-1">
                  Masukkan Token QR / NIS
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Contoh: SMAN1L-..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold placeholder:text-slate-300"
                />
              </div>

              <div className="p-4 bg-indigo-50 rounded-2xl flex gap-3">
                <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                <p className="text-[11px] text-indigo-800 leading-relaxed font-medium">
                  Sistem akan memverifikasi token ini dengan database siswa. Pastikan kode yang dimasukkan sudah benar.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="flex-1 py-4 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-[2] py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Proses Presensi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, Wifi, WifiOff, RefreshCw, Loader2, Search, X, ChevronDown,
  Server, Download, Copy, Check, Play, Square,
  Mic, Volume2, AlertCircle, Bell,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke, tauriListen } from '@/lib/tauri';
import { ProviderConfig, ProviderInfo, SttEngine, SttModel, ElevenLabsVoice, DownloadProgress, ForgettingNudge } from '@/data/types';
import { getWeekNumber } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
type OllamaStatus = 'idle' | 'loading' | 'ok' | 'error';
type OpenRouterStatus = 'idle' | 'loading' | 'ok' | 'error';

interface SyncServerInfo {
  running: boolean;
  local_ip: string | null;
  port: number;
}

// ── Voice Settings ─────────────────────────────────────────────────────────────

const MODEL_INFO: Record<SttModel, { label: string; whisperCppMb: number; sherpaOnnxMb: number; wer: string }> = {
  tiny:  { label: 'Tiny',  whisperCppMb: 75,  sherpaOnnxMb: 42,  wer: '~10% WER' },
  base:  { label: 'Base',  whisperCppMb: 142, sherpaOnnxMb: 80,  wer: '~7% WER'  },
  small: { label: 'Small', whisperCppMb: 466, sherpaOnnxMb: 195, wer: '~3.4% WER' },
};

// Detect Android — used to hide whisper.cpp option (not available on Android)
const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function VoiceSettingsSection() {
  const { voiceConfig, setVoiceConfig } = useAppStore();

  const [modelStatus, setModelStatus] = useState<{ downloaded: boolean; sizeMb: number | null } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);

  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState('');

  // Check model status whenever engine/model changes
  useEffect(() => {
    tauriInvoke<{ downloaded: boolean; size_mb: number | null }>('get_stt_model_status', {
      engine: voiceConfig.sttEngine,
      model: voiceConfig.sttModel,
    })
      .then((s) => setModelStatus({ downloaded: s.downloaded, sizeMb: s.size_mb }))
      .catch(console.error);
  }, [voiceConfig.sttEngine, voiceConfig.sttModel]);

  // Fetch ElevenLabs voices when API key is set
  const fetchVoices = useCallback(async () => {
    if (!voiceConfig.elevenLabsApiKey) return;
    setVoicesLoading(true);
    setVoicesError('');
    try {
      const v = await tauriInvoke<ElevenLabsVoice[]>('get_elevenlabs_voices', {
        apiKey: voiceConfig.elevenLabsApiKey,
      });
      setVoices(v);
    } catch (e) {
      setVoicesError(String(e));
    } finally {
      setVoicesLoading(false);
    }
  }, [voiceConfig.elevenLabsApiKey]);

  useEffect(() => {
    if (voiceConfig.elevenLabsApiKey) fetchVoices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    setDownloading(true);
    setDlProgress({ engine: voiceConfig.sttEngine, model: voiceConfig.sttModel, percent: 0, downloadedMb: 0, totalMb: 0 });

    const unlisten = await tauriListen('stt-download-progress', (payload) => {
      setDlProgress(payload as DownloadProgress);
    });

    try {
      await tauriInvoke('download_stt_model', {
        engine: voiceConfig.sttEngine,
        model: voiceConfig.sttModel,
      });
      const s = await tauriInvoke<{ downloaded: boolean; size_mb: number | null }>('get_stt_model_status', {
        engine: voiceConfig.sttEngine,
        model: voiceConfig.sttModel,
      });
      setModelStatus({ downloaded: s.downloaded, sizeMb: s.size_mb });
    } catch (e) {
      console.error(e);
    } finally {
      unlisten();
      setDownloading(false);
      setDlProgress(null);
    }
  };

  const info = MODEL_INFO[voiceConfig.sttModel];
  const sizeMb = voiceConfig.sttEngine === 'whisper-cpp' ? info.whisperCppMb : info.sherpaOnnxMb;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.11 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5 space-y-4"
    >
      {/* Header with enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic size={15} className="text-[#2E5FA3]" />
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Voice</h2>
        </div>
        <button
          onClick={() => setVoiceConfig({ enabled: !voiceConfig.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            voiceConfig.enabled ? 'bg-[#2E5FA3]' : 'bg-[#1a2540]'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              voiceConfig.enabled ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {voiceConfig.enabled && (
        <div className="space-y-4">
          {/* ── STT Engine ─────────────────────────────────────────────────── */}
          {IS_ANDROID ? (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-950/30 border border-amber-700/40">
              <AlertCircle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-300/80">
                On-device speech recognition is not available on Android. You can still use
                ElevenLabs TTS to hear AI replies — enable it below.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-wide mb-2 block">
                Speech Recognition Engine
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['sherpa-onnx', 'whisper-cpp'] as SttEngine[]).map((eng) => (
                  <button
                    key={eng}
                    onClick={() => setVoiceConfig({ sttEngine: eng })}
                    className={`px-3 py-2.5 rounded-lg border text-left transition-all ${
                      voiceConfig.sttEngine === eng
                        ? 'border-[#2E5FA3] bg-[#2E5FA3]/15'
                        : 'border-[#1a2540] hover:border-[#4a5568]'
                    }`}
                  >
                    <p className={`text-xs font-semibold ${voiceConfig.sttEngine === eng ? 'text-[#2E5FA3]' : 'text-[#e2e8f0]'}`}>
                      {eng === 'sherpa-onnx' ? 'Sherpa-ONNX' : 'Whisper.cpp'}
                    </p>
                    <p className="text-[10px] text-[#4a5568] mt-0.5">
                      {eng === 'sherpa-onnx' ? 'Desktop • INT8 ONNX' : 'Desktop • Metal acceleration'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STT Model (desktop only) ───────────────────────────────────── */}
          {!IS_ANDROID && <div>
            <label className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-wide mb-2 block">
              Model Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(MODEL_INFO) as [SttModel, typeof MODEL_INFO[SttModel]][]).map(([m, meta]) => {
                const mb = voiceConfig.sttEngine === 'whisper-cpp' ? meta.whisperCppMb : meta.sherpaOnnxMb;
                return (
                  <button
                    key={m}
                    onClick={() => setVoiceConfig({ sttModel: m })}
                    className={`px-3 py-2.5 rounded-lg border text-left transition-all ${
                      voiceConfig.sttModel === m
                        ? 'border-[#2E5FA3] bg-[#2E5FA3]/15'
                        : 'border-[#1a2540] hover:border-[#4a5568]'
                    }`}
                  >
                    <p className={`text-xs font-semibold ${voiceConfig.sttModel === m ? 'text-[#2E5FA3]' : 'text-[#e2e8f0]'}`}>
                      {meta.label}
                    </p>
                    <p className="text-[10px] text-[#4a5568] mt-0.5">{mb} MB</p>
                    <p className="text-[10px] text-green-500/70 mt-0.5">{meta.wer}</p>
                  </button>
                );
              })}
            </div>
          </div>}

          {/* ── Model download status (desktop only) ──────────────────────── */}
          {!IS_ANDROID &&
          <div className="rounded-lg border border-[#1a2540] px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#e2e8f0]">
                  {voiceConfig.sttEngine === 'sherpa-onnx' ? 'Sherpa-ONNX' : 'Whisper.cpp'}{' '}
                  <span className="font-mono">{voiceConfig.sttModel}</span>
                </p>
                {modelStatus?.downloaded ? (
                  <p className="text-[10px] text-green-400 flex items-center gap-1 mt-0.5">
                    <Check size={10} /> Ready · {modelStatus.sizeMb?.toFixed(0)} MB
                  </p>
                ) : (
                  <p className="text-[10px] text-[#4a5568] mt-0.5">~{sizeMb} MB · not downloaded</p>
                )}
              </div>

              {!modelStatus?.downloaded && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2E5FA3]/20 border border-[#2E5FA3]/40 text-xs text-[#2E5FA3] hover:bg-[#2E5FA3]/30 transition-all disabled:opacity-50"
                >
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {downloading ? 'Downloading…' : 'Download'}
                </button>
              )}
            </div>

            {/* Progress bar */}
            {dlProgress && (
              <div className="space-y-1">
                <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2E5FA3] rounded-full transition-all"
                    style={{ width: `${dlProgress.percent}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#4a5568] font-mono">
                  {dlProgress.downloadedMb.toFixed(1)} / {dlProgress.totalMb.toFixed(1)} MB — {dlProgress.percent}%
                </p>
              </div>
            )}
          </div>}

          {/* ── Behaviour toggles ──────────────────────────────────────────── */}
          <div className="space-y-2">
            {[
              { key: 'autoSend',   label: 'Auto-send transcript', desc: 'Submit transcript immediately without confirmation' },
              { key: 'ttsEnabled', label: 'Read replies aloud',   desc: 'Play AI responses via ElevenLabs TTS' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540]">
                <div>
                  <p className="text-xs text-[#e2e8f0]">{label}</p>
                  <p className="text-[10px] text-[#4a5568]">{desc}</p>
                </div>
                <button
                  onClick={() => setVoiceConfig({ [key]: !voiceConfig[key as keyof typeof voiceConfig] })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                    voiceConfig[key as keyof typeof voiceConfig] ? 'bg-[#2E5FA3]' : 'bg-[#1a2540]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      voiceConfig[key as keyof typeof voiceConfig] ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* ── ElevenLabs ─────────────────────────────────────────────────── */}
          {voiceConfig.ttsEnabled && (
            <div className="space-y-3 pt-1 border-t border-[#1a2540]">
              <div className="flex items-center gap-1.5 pt-1">
                <Volume2 size={12} className="text-[#4a5568]" />
                <span className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-wide">
                  ElevenLabs TTS
                </span>
              </div>

              <div>
                <label className="text-[10px] text-[#4a5568] uppercase tracking-wide mb-1 block">
                  API Key
                </label>
                <input
                  type="password"
                  value={voiceConfig.elevenLabsApiKey}
                  onChange={(e) => setVoiceConfig({ elevenLabsApiKey: e.target.value })}
                  onBlur={fetchVoices}
                  placeholder="sk-…"
                  className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#2E5FA3] font-mono"
                />
              </div>

              {/* Voice selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-[#4a5568] uppercase tracking-wide">Voice</label>
                  {voicesLoading && <Loader2 size={11} className="animate-spin text-[#4a5568]" />}
                  {!voicesLoading && voiceConfig.elevenLabsApiKey && (
                    <button onClick={fetchVoices} className="text-[10px] text-[#4a5568] hover:text-[#2E5FA3] flex items-center gap-1">
                      <RefreshCw size={10} /> Refresh
                    </button>
                  )}
                </div>

                {voicesError && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/40 text-[10px] text-red-400 mb-2">
                    <AlertCircle size={11} /> {voicesError}
                  </div>
                )}

                {voices.length > 0 ? (
                  <select
                    value={voiceConfig.elevenLabsVoiceId}
                    onChange={(e) => setVoiceConfig({ elevenLabsVoiceId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2E5FA3]"
                  >
                    {voices.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name} {v.category !== 'premade' ? `(${v.category})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  !voicesLoading && voiceConfig.elevenLabsApiKey && (
                    <p className="text-[10px] text-[#4a5568] px-1">
                      Enter your API key above, then blur to load voices.
                    </p>
                  )
                )}

                {!voiceConfig.elevenLabsApiKey && (
                  <p className="text-[10px] text-[#4a5568] px-1">
                    Get a free API key at{' '}
                    <span className="text-[#2E5FA3]">elevenlabs.io</span> — 10,000 chars/month free.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

// ── Forgetting Curve Reminders ─────────────────────────────────────────────────
type TestStatus = 'idle' | 'sending' | 'sent' | 'none' | 'error';

function clampHour(n: number): number {
  return Math.min(23, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));
}

function ForgettingCurveSection() {
  const { forgettingCurveSettings: settings, setForgettingCurveSettings } = useAppStore();
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  const handleTestReminder = async () => {
    setTestStatus('sending');
    try {
      // Large lookahead so any tracked-but-decaying item surfaces for QA.
      const nudges = await tauriInvoke<ForgettingNudge[]>('get_forgetting_curve_due', {
        lookaheadMin: 60 * 24 * 365,
        maxItems: 1,
      });
      if (nudges.length === 0) {
        setTestStatus('none');
        return;
      }
      const n = nudges[0];
      await tauriInvoke('schedule_notification', { title: n.title, body: n.body, hour: 0, minute: 0 });
      setTestStatus('sent');
    } catch (err) {
      console.error('Test reminder failed:', err);
      setTestStatus('error');
    }
  };

  const numberField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts: { min: number; max?: number } = { min: 0 }
  ) => (
    <div>
      <label className="text-[10px] text-[#4a5568] uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type="number"
        value={value}
        min={opts.min}
        max={opts.max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] font-mono focus:outline-none focus:border-[#2E5FA3]"
      />
    </div>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.115 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-[#C9A84C]" />
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Forgetting Curve Reminders</h2>
        </div>
        <button
          onClick={() => setForgettingCurveSettings({ enabled: !settings.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            settings.enabled ? 'bg-[#C9A84C]' : 'bg-[#1a2540]'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              settings.enabled ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <p className="text-[11px] text-[#4a5568]">
        Get a nudge right when a concept is about to slip — timed to each item's decay, not on a
        fixed schedule. Reminders only fire while the app is open.
      </p>

      {settings.enabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {numberField('Quiet hours start (24h)', settings.quietHoursStart, (v) =>
              setForgettingCurveSettings({ quietHoursStart: clampHour(v) }), { min: 0, max: 23 })}
            {numberField('Quiet hours end (24h)', settings.quietHoursEnd, (v) =>
              setForgettingCurveSettings({ quietHoursEnd: clampHour(v) }), { min: 0, max: 23 })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {numberField('Max reminders / day', settings.dailyCap, (v) =>
              setForgettingCurveSettings({ dailyCap: Math.max(0, Math.floor(v || 0)) }), { min: 0 })}
            {numberField('Check interval (min)', settings.pollMinutes, (v) =>
              setForgettingCurveSettings({ pollMinutes: Math.max(1, Math.floor(v || 1)) }), { min: 1 })}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleTestReminder}
              disabled={testStatus === 'sending'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C9A84C]/40 text-sm text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-all disabled:opacity-50"
            >
              {testStatus === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
              Send a test reminder now
            </button>
            {testStatus === 'sent' && <span className="text-xs text-green-400">Sent ✓</span>}
            {testStatus === 'none' && <span className="text-xs text-[#4a5568]">Nothing due to review yet</span>}
            {testStatus === 'error' && <span className="text-xs text-red-400">Failed — check notification permission</span>}
          </div>
        </div>
      )}
    </motion.section>
  );
}

// ── WiFi Sync UI Component ─────────────────────────────────────────────────────
function WifiSyncSection() {
  // ── Server state ──────────────────────────────────────────────────────────
  const [pin, setPin] = useState('1234');
  const [port, setPort] = useState('7432');
  const [serverInfo, setServerInfo] = useState<SyncServerInfo | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Client state ──────────────────────────────────────────────────────────
  const [clientUrl, setClientUrl] = useState('');
  const [clientPin, setClientPin] = useState('1234');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncMsg, setSyncMsg] = useState('');

  // Check initial server status on mount
  useEffect(() => {
    tauriInvoke<SyncServerInfo>('get_sync_server_status')
      .then(setServerInfo)
      .catch(console.error);
  }, []);

  const serverUrl = serverInfo?.local_ip
    ? `http://${serverInfo.local_ip}:${serverInfo.port}`
    : null;

  const handleStartStop = async () => {
    setServerLoading(true);
    try {
      if (serverInfo?.running) {
        await tauriInvoke('stop_sync_server');
        setServerInfo((prev) => prev ? { ...prev, running: false } : null);
      } else {
        const info = await tauriInvoke<SyncServerInfo>('start_sync_server', {
          pin,
          port: parseInt(port, 10),
        });
        setServerInfo(info);
      }
    } catch (err) {
      console.error('Sync server toggle error:', err);
    } finally {
      setServerLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (serverUrl) {
      navigator.clipboard.writeText(serverUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Client: pull all conversations + messages from desktop
  const handlePull = async () => {
    setSyncStatus('syncing');
    setSyncMsg('');
    try {
      const url = clientUrl.replace(/\/$/, '');

      // 1. Fetch conversation list
      const convRes = await fetch(`${url}/conversations`, {
        headers: { Authorization: `Bearer ${clientPin}` },
      });
      if (!convRes.ok) throw new Error(`Auth failed (${convRes.status})`);
      const conversations = await convRes.json();

      // 2. Fetch messages for each conversation
      const allMessages: unknown[] = [];
      for (const conv of conversations) {
        const msgRes = await fetch(`${url}/conversations/${conv.id}/messages`, {
          headers: { Authorization: `Bearer ${clientPin}` },
        });
        if (msgRes.ok) {
          const msgs = await msgRes.json();
          allMessages.push(...msgs);
        }
      }

      // 3. Persist into local DB via Tauri
      await tauriInvoke('bulk_import_sync', { conversations, messages: allMessages });

      setSyncStatus('ok');
      setSyncMsg(`Synced ${conversations.length} conversations, ${allMessages.length} messages`);
    } catch (err) {
      setSyncStatus('error');
      setSyncMsg(String(err));
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5 space-y-5"
    >
      <div className="flex items-center gap-2">
        <Wifi size={15} className="text-[#2E5FA3]" />
        <h2 className="text-sm font-semibold text-[#e2e8f0]">WiFi Sync</h2>
        <span className="text-[10px] text-[#4a5568] font-mono bg-[#1a2540] px-2 py-0.5 rounded-full">
          same network
        </span>
      </div>

      {/* ── Desktop Server ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Server size={12} className="text-[#4a5568]" />
          <span className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">Desktop Server</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-[#4a5568] uppercase tracking-wide mb-1 block">PIN</label>
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={serverInfo?.running}
              maxLength={8}
              className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] font-mono focus:outline-none focus:border-[#2E5FA3] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#4a5568] uppercase tracking-wide mb-1 block">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={serverInfo?.running}
              min={1024}
              max={65535}
              className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] font-mono focus:outline-none focus:border-[#2E5FA3] disabled:opacity-50"
            />
          </div>
        </div>

        {/* Start/Stop button */}
        <button
          onClick={handleStartStop}
          disabled={serverLoading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
            serverInfo?.running
              ? 'bg-red-900/30 border border-red-800/50 text-red-400 hover:bg-red-900/50'
              : 'bg-green-900/30 border border-green-800/50 text-green-400 hover:bg-green-900/50'
          }`}
        >
          {serverLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : serverInfo?.running ? (
            <Square size={14} />
          ) : (
            <Play size={14} />
          )}
          {serverLoading
            ? 'Working…'
            : serverInfo?.running
            ? 'Stop Server'
            : 'Start Server'}
        </button>

        {/* Server URL display */}
        {serverInfo?.running && serverUrl && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-950/20 border border-green-800/30">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
            <span className="font-mono text-xs text-green-400 flex-1 truncate">{serverUrl}</span>
            <button
              onClick={handleCopyUrl}
              className="text-[#4a5568] hover:text-[#e2e8f0] transition-colors shrink-0"
              title="Copy URL"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[#1a2540]" />

      {/* ── Mobile Client ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Download size={12} className="text-[#4a5568]" />
          <span className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">Pull from Desktop</span>
        </div>

        <div>
          <label className="text-[10px] text-[#4a5568] uppercase tracking-wide mb-1 block">Desktop URL</label>
          <input
            type="text"
            value={clientUrl}
            onChange={(e) => setClientUrl(e.target.value)}
            placeholder="http://192.168.1.x:7432"
            className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] font-mono placeholder-[#4a5568] focus:outline-none focus:border-[#2E5FA3]"
          />
        </div>

        <div>
          <label className="text-[10px] text-[#4a5568] uppercase tracking-wide mb-1 block">PIN</label>
          <input
            type="text"
            value={clientPin}
            onChange={(e) => setClientPin(e.target.value)}
            maxLength={8}
            className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] font-mono focus:outline-none focus:border-[#2E5FA3]"
          />
        </div>

        <button
          onClick={handlePull}
          disabled={!clientUrl || syncStatus === 'syncing'}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2E5FA3]/20 border border-[#2E5FA3]/40 text-sm font-semibold text-[#2E5FA3] hover:bg-[#2E5FA3]/30 transition-all disabled:opacity-50"
        >
          {syncStatus === 'syncing' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {syncStatus === 'syncing' ? 'Syncing…' : 'Pull Conversations'}
        </button>

        {/* Sync result */}
        {syncStatus === 'ok' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-950/20 border border-green-800/30 text-xs text-green-400">
            <Check size={12} />
            {syncMsg}
          </div>
        )}
        {syncStatus === 'error' && (
          <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400">
            <p className="font-semibold">Sync failed</p>
            <p className="text-red-500/80 font-mono break-all mt-0.5">{syncMsg}</p>
          </div>
        )}

        <p className="text-[10px] text-[#4a5568]">
          Start the server on your desktop, then enter its URL here to import all conversations to this device.
        </p>
      </div>
    </motion.section>
  );
}

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number | null;
  pricing_prompt: string;
  pricing_completion: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCtx(n: number | null): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M ctx`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ctx`;
  return `${n} ctx`;
}

function formatPrice(p: string): string {
  const f = parseFloat(p);
  if (!f || isNaN(f)) return 'free';
  if (f < 0.001) return `$${(f * 1_000_000).toFixed(2)}/1M`;
  return `$${f.toFixed(4)}/1M`;
}

// ── OpenRouter Model Picker ───────────────────────────────────────────────────
interface ModelPickerProps {
  models: OpenRouterModel[];
  value: string;
  onChange: (id: string) => void;
}

function OpenRouterModelPicker({ models, value, onChange }: ModelPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          m.id.toLowerCase().includes(query.toLowerCase())
      )
    : models;

  const selected = models.find((m) => m.id === value);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] hover:border-[#2E5FA3] transition-colors focus:outline-none focus:border-[#2E5FA3]"
      >
        <span className="font-mono truncate text-left">
          {selected ? selected.name : value || 'Select a model…'}
        </span>
        <ChevronDown
          size={14}
          className={`ml-2 shrink-0 text-[#4a5568] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Selected model meta */}
      {selected && (
        <div className="flex items-center gap-3 mt-1.5 px-1 text-[10px] text-[#4a5568] font-mono">
          <span className="opacity-60">{selected.id}</span>
          {selected.context_length && (
            <span className="text-[#2E5FA3]">{formatCtx(selected.context_length)}</span>
          )}
          <span>in: {formatPrice(selected.pricing_prompt)}</span>
          <span>out: {formatPrice(selected.pricing_completion)}</span>
        </div>
      )}

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ transformOrigin: 'top' }}
            className="absolute z-50 mt-1 w-full rounded-xl bg-[#0f1629] border border-[#1a2540] shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a2540] sticky top-0 bg-[#0f1629]">
              <Search size={13} className="text-[#4a5568] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${models.length.toLocaleString()} models…`}
                className="flex-1 bg-transparent text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-[#4a5568] hover:text-[#e2e8f0]">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-64 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-xs text-[#4a5568] text-center">
                  No models match "{query}"
                </div>
              ) : (
                filtered.slice(0, 200).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelect(m.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-[#1a2540] transition-colors border-b border-[#1a2540]/50 last:border-0 ${
                      m.id === value ? 'bg-[#2E5FA3]/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#e2e8f0] truncate">{m.name}</p>
                        <p className="text-[10px] font-mono text-[#4a5568] truncate">{m.id}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        {m.context_length && (
                          <p className="text-[10px] text-[#2E5FA3]">{formatCtx(m.context_length)}</p>
                        )}
                        <p className="text-[10px] text-[#4a5568]">
                          {formatPrice(m.pricing_prompt)} in
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
              {filtered.length > 200 && (
                <div className="px-4 py-2 text-[10px] text-[#4a5568] text-center border-t border-[#1a2540]">
                  Showing 200 of {filtered.length.toLocaleString()} — refine your search
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Settings Component ───────────────────────────────────────────────────
export default function Settings() {
  const { providerConfig, setProviderConfig } = useAppStore();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [config, setConfig] = useState<ProviderConfig>({ ...providerConfig });

  // Ollama-specific state
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>('idle');
  const [ollamaError, setOllamaError] = useState<string>('');

  // OpenRouter-specific state
  const [orModels, setOrModels] = useState<OpenRouterModel[]>([]);
  const [orStatus, setOrStatus] = useState<OpenRouterStatus>('idle');
  const [orError, setOrError] = useState<string>('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);

  const week = getWeekNumber();
  const selectedProvider = providers.find((p) => p.id === config.provider);
  const isOllama = config.provider === 'ollama';
  const isOpenRouter = config.provider === 'openrouter';

  // ── Load static providers on mount ────────────────────────────────────────
  useEffect(() => {
    tauriInvoke<ProviderInfo[]>('get_providers').then(setProviders).catch(console.error);
  }, []);

  // ── Fetch Ollama models ───────────────────────────────────────────────────
  const fetchOllamaModels = useCallback(async (baseUrl?: string) => {
    setOllamaStatus('loading');
    setOllamaError('');
    try {
      const models = await tauriInvoke<string[]>('get_ollama_models', {
        baseUrl: baseUrl ?? config.baseUrl ?? 'http://localhost:11434',
      });
      setOllamaModels(models);
      setOllamaStatus('ok');
      if (models.length > 0 && !models.includes(config.model)) {
        setConfig((prev) => ({ ...prev, model: models[0] }));
      }
    } catch (err) {
      setOllamaModels([]);
      setOllamaStatus('error');
      setOllamaError(String(err));
    }
  }, [config.baseUrl, config.model]);

  // ── Fetch OpenRouter models ───────────────────────────────────────────────
  const fetchOpenRouterModels = useCallback(async () => {
    setOrStatus('loading');
    setOrError('');
    try {
      const models = await tauriInvoke<OpenRouterModel[]>('get_openrouter_models');
      setOrModels(models);
      setOrStatus('ok');
    } catch (err) {
      setOrModels([]);
      setOrStatus('error');
      setOrError(String(err));
    }
  }, []);

  // Auto-fetch on provider switch
  useEffect(() => {
    if (isOllama) fetchOllamaModels();
  }, [isOllama]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpenRouter && orStatus === 'idle') fetchOpenRouterModels();
  }, [isOpenRouter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Provider change ────────────────────────────────────────────────────────
  const handleProviderChange = (providerId: string) => {
    const p = providers.find((pr) => pr.id === providerId);
    if (p) {
      setConfig((prev) => ({
        ...prev,
        provider: providerId as ProviderConfig['provider'],
        model: p.default_model,
        baseUrl: p.base_url ?? undefined,
      }));
      if (providerId !== 'ollama') {
        setOllamaModels([]);
        setOllamaStatus('idle');
        setOllamaError('');
      }
      if (providerId !== 'openrouter') {
        setOrModels([]);
        setOrStatus('idle');
        setOrError('');
      }
    }
  };

  // ── Base URL blur → refresh Ollama models ─────────────────────────────────
  const handleBaseUrlBlur = () => {
    if (isOllama) fetchOllamaModels(config.baseUrl);
  };

  // ── Connection test ────────────────────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (isOllama) {
        await fetchOllamaModels(config.baseUrl);
        setTestResult(ollamaStatus === 'error' ? 'error' : 'ok');
      } else if (isOpenRouter) {
        await fetchOpenRouterModels();
        setTestResult(orStatus === 'error' ? 'error' : 'ok');
      } else {
        await tauriInvoke('get_providers');
        setTestResult('ok');
      }
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      await tauriInvoke('save_provider_config', { config });
      setProviderConfig(config);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ── Model options: dynamic for Ollama, static for others ─────────────────
  const ollamaModelOptions = isOllama ? ollamaModels : [];
  const staticModelOptions = !isOllama && !isOpenRouter
    ? (selectedProvider?.available_models ?? [])
    : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-bold text-[#e2e8f0] mb-1">Settings</h1>
          <p className="text-sm text-[#4a5568]">Configure your AI provider and preferences</p>
        </motion.div>

        {/* ── AI Provider ─────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-[#e2e8f0]">AI Provider</h2>

          {/* Provider select */}
          <div>
            <label className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide mb-2 block">
              Provider
            </label>
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2E5FA3]"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* API Key (cloud providers) */}
          {selectedProvider?.requires_api_key && (
            <div>
              <label className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide mb-2 block">
                API Key
              </label>
              <input
                type="password"
                value={config.apiKey ?? ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={`Enter ${selectedProvider.name} API key…`}
                className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#2E5FA3]"
              />
            </div>
          )}

          {/* Base URL (Ollama) */}
          {isOllama && (
            <div>
              <label className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide mb-2 block">
                Ollama URL
              </label>
              <input
                type="text"
                value={config.baseUrl ?? 'http://localhost:11434'}
                onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                onBlur={handleBaseUrlBlur}
                className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] focus:outline-none focus:border-[#0E7C86] font-mono"
              />
              <p className="text-xs text-[#4a5568] mt-1">
                Tab out of this field to reload models from the new URL.
              </p>
            </div>
          )}

          {/* Model section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">
                Model
              </label>

              {/* Ollama refresh button */}
              {isOllama && (
                <button
                  onClick={() => fetchOllamaModels(config.baseUrl)}
                  disabled={ollamaStatus === 'loading'}
                  className="flex items-center gap-1.5 text-xs text-[#4a5568] hover:text-[#0E7C86] transition-colors disabled:opacity-40"
                  title="Refresh models from Ollama"
                >
                  {ollamaStatus === 'loading' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  Refresh
                </button>
              )}

              {/* OpenRouter refresh button */}
              {isOpenRouter && (
                <button
                  onClick={fetchOpenRouterModels}
                  disabled={orStatus === 'loading'}
                  className="flex items-center gap-1.5 text-xs text-[#4a5568] hover:text-[#2E5FA3] transition-colors disabled:opacity-40"
                  title="Reload model catalogue from OpenRouter"
                >
                  {orStatus === 'loading' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  Refresh
                </button>
              )}
            </div>

            {/* ── Ollama status banners ── */}
            {isOllama && ollamaStatus === 'loading' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-xs text-[#4a5568]">
                <Loader2 size={13} className="animate-spin text-[#0E7C86]" />
                Querying Ollama for installed models…
              </div>
            )}
            {isOllama && ollamaStatus === 'error' && (
              <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400 space-y-1">
                <p className="font-semibold">Ollama not reachable</p>
                <p className="text-red-500/80 font-mono break-all">{ollamaError}</p>
                <p className="text-red-400/60">
                  Make sure Ollama is running:{' '}
                  <code className="font-mono">ollama serve</code>
                </p>
              </div>
            )}
            {isOllama && ollamaStatus === 'ok' && ollamaModelOptions.length === 0 && (
              <div className="px-3 py-2 rounded-lg bg-yellow-950/30 border border-yellow-800/40 text-xs text-yellow-400">
                No models installed. Pull one with:{' '}
                <code className="font-mono">ollama pull llama3.2</code>
              </div>
            )}
            {isOllama && ollamaStatus === 'ok' && ollamaModelOptions.length > 0 && (
              <>
                <select
                  value={config.model}
                  onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] focus:outline-none focus:border-[#0E7C86] font-mono"
                >
                  {ollamaModelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-[#0E7C86] mt-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0E7C86] inline-block" />
                  {ollamaModelOptions.length} model{ollamaModelOptions.length !== 1 ? 's' : ''} available
                </p>
              </>
            )}

            {/* ── OpenRouter status banners + searchable picker ── */}
            {isOpenRouter && orStatus === 'loading' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-xs text-[#4a5568]">
                <Loader2 size={13} className="animate-spin text-[#2E5FA3]" />
                Loading OpenRouter model catalogue…
              </div>
            )}
            {isOpenRouter && orStatus === 'error' && (
              <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400 space-y-1">
                <p className="font-semibold">Could not load OpenRouter models</p>
                <p className="text-red-500/80 font-mono break-all">{orError}</p>
              </div>
            )}
            {isOpenRouter && orStatus === 'ok' && (
              <>
                <OpenRouterModelPicker
                  models={orModels}
                  value={config.model}
                  onChange={(id) => setConfig((prev) => ({ ...prev, model: id }))}
                />
                <p className="text-xs text-[#2E5FA3] mt-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2E5FA3] inline-block" />
                  {orModels.length.toLocaleString()} models available
                </p>
              </>
            )}
            {isOpenRouter && orStatus === 'idle' && (
              <div className="px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-xs text-[#4a5568]">
                <input
                  readOnly
                  value={config.model}
                  className="w-full bg-transparent font-mono text-[#e2e8f0] focus:outline-none"
                />
              </div>
            )}

            {/* ── Static model select (Anthropic / Google) ── */}
            {!isOllama && !isOpenRouter && staticModelOptions.length > 0 && (
              <select
                value={config.model}
                onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#080d1a] border border-[#1a2540] text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2E5FA3] font-mono"
              >
                {staticModelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
          </div>

          {/* Test + Save */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1a2540] text-sm text-[#4a5568] hover:text-[#e2e8f0] hover:border-[#4a5568] transition-all disabled:opacity-50"
            >
              {testing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : testResult === 'ok' ? (
                <Wifi size={14} className="text-green-400" />
              ) : testResult === 'error' ? (
                <WifiOff size={14} className="text-red-400" />
              ) : (
                <Wifi size={14} />
              )}
              {testing
                ? 'Testing…'
                : testResult === 'ok'
                ? 'Connected ✓'
                : testResult === 'error'
                ? 'Failed ✗'
                : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2E5FA3] text-sm font-semibold text-white hover:bg-[#3a71c1] transition-all disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </motion.section>

        {/* ── Plan Dates ──────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5 space-y-3"
        >
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Plan Dates</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#4a5568]">Sprint start date</p>
              <p className="text-sm font-mono text-[#e2e8f0]">2026-06-01</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#4a5568]">Current week</p>
              <p className="text-xl font-bold" style={{ color: '#C9A84C' }}>
                Week {week}{' '}
                <span className="text-sm font-normal text-[#4a5568]">of 12</span>
              </p>
            </div>
          </div>
          <div className="h-2 bg-[#1a2540] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min((week / 12) * 100, 100)}%`, backgroundColor: '#C9A84C' }}
            />
          </div>
          <p className="text-xs text-[#4a5568]">{Math.max(12 - week, 0)} weeks remaining</p>
        </motion.section>

        {/* ── Voice ───────────────────────────────────────────────────────── */}
        <VoiceSettingsSection />

        {/* ── Forgetting Curve Reminders ──────────────────────────────────── */}
        <ForgettingCurveSection />

        {/* ── WiFi Sync ───────────────────────────────────────────────────── */}
        <WifiSyncSection />

        {/* ── About ───────────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
        >
          <h2 className="text-sm font-semibold text-[#e2e8f0] mb-3">About</h2>
          <div className="space-y-2 text-xs text-[#4a5568]">
            <div className="flex justify-between">
              <span>Version</span>
              <span className="font-mono text-[#e2e8f0]">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span>Stack</span>
              <span className="font-mono text-[#e2e8f0]">Tauri v2 · React 18 · Rust</span>
            </div>
            <div className="flex justify-between">
              <span>Built by</span>
              <span className="font-mono text-[#e2e8f0]">Augmentifai</span>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

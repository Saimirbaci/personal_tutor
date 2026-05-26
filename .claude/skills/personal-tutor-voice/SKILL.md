---
name: personal-tutor-voice
description: "Voice system for Personal Tutor — STT (sherpa-onnx vs whisper-rs), ElevenLabs TTS, model download flow, VoiceConfig, SttModelStatus, DownloadProgress events, platform gating. Use for: adding voice features, debugging transcription, changing TTS settings, managing STT model downloads. Trigger on: useVoice, transcribe_audio, tts_elevenlabs, sherpa-onnx, whisper-rs, SttModelStatus, DownloadProgress, VoiceConfig, get_stt_model_status, download_stt_model, get_elevenlabs_voices."
---

# Personal Tutor — Voice System

You have deep knowledge of the voice I/O system: STT model management, transcription, and ElevenLabs TTS. Use this to implement or debug voice features correctly.

---

## Architecture Overview

```
Voice Input (microphone)
       │
       ▼
Frontend: useVoice hook
  startRecording() → MediaRecorder API
  stopRecording()  → returns audio Blob
       │
       ▼
tauriInvoke('transcribe_audio', { audioBytes })
       │
       ▼ (Rust, desktop-only)
commands/voice.rs::transcribe_audio()
  → Routes to active STT engine:
    sherpa-onnx (default) → SherpaSttEngine
    whisper-rs             → WhisperSttEngine
       │
       ▼
Returns transcript string to frontend

Voice Output (TTS)
       │
tauriInvoke('tts_elevenlabs', { text, voiceId })
       │
       ▼ (Rust)
commands/voice.rs::tts_elevenlabs()
  POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
       │
       ▼
Returns Vec<u8> (audio bytes) → decoded + played in browser
```

---

## Platform Gating (CRITICAL)

All STT code is desktop-only — must be behind `#[cfg(not(target_os = "android"))]`:

```rust
// src-tauri/src/commands/voice.rs
#[cfg(not(target_os = "android"))]
mod desktop_voice {
    use super::*;
    
    #[tauri::command]
    pub async fn transcribe_audio(
        audio_bytes: Vec<u8>,
        engine: String,   // "sherpa-onnx" | "whisper-cpp"
        model: String,    // "tiny" | "base" | "small"
        app: AppHandle,
    ) -> Result<String, String> { ... }
    
    #[tauri::command]
    pub async fn download_stt_model(
        model: String,
        engine: String,
        app: AppHandle,
    ) -> Result<(), String> { ... }
    
    #[tauri::command]
    pub async fn get_stt_model_status(
        app: AppHandle,
    ) -> Result<Vec<SttModelStatus>, String> { ... }
}

// Export for registration — stubs on Android
#[cfg(not(target_os = "android"))]
pub use desktop_voice::*;

// TTS (ElevenLabs) works on all platforms
#[tauri::command]
pub async fn tts_elevenlabs(
    text: String,
    voice_id: String,
    api_key: String,
) -> Result<Vec<u8>, String> { ... }

#[tauri::command]
pub async fn get_elevenlabs_voices(
    api_key: String,
) -> Result<Vec<ElevenLabsVoice>, String> { ... }
```

---

## Rust Types (`src-tauri/src/commands/voice.rs`)

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SttModelStatus {
    pub engine: String,     // "sherpa-onnx" | "whisper-cpp"
    pub model: String,      // "tiny" | "base" | "small"
    pub downloaded: bool,
    pub size_mb: f32,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ElevenLabsVoice {
    pub voice_id: String,
    pub name: String,
    pub category: Option<String>,
}
```

---

## Model Download with Progress Events

The download emits `stt-download-progress` events during download:

```rust
// In download_stt_model command:
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f32,
    pub done: bool,
}

// During download loop:
window.emit("stt-download-progress", DownloadProgress {
    model: model.clone(),
    downloaded_bytes: bytes_downloaded,
    total_bytes: total,
    percentage: (bytes_downloaded as f32 / total as f32) * 100.0,
    done: false,
}).map_err(|e| e.to_string())?;

// At completion:
window.emit("stt-download-progress", DownloadProgress {
    model: model.clone(),
    downloaded_bytes: total,
    total_bytes: total,
    percentage: 100.0,
    done: true,
}).map_err(|e| e.to_string())?;
```

---

## TypeScript Types (`src/data/types.ts`)

```typescript
interface VoiceConfig {
  sttEngine: 'sherpa-onnx' | 'whisper-cpp';
  sttModel: 'tiny' | 'base' | 'small';
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  ttsEnabled: boolean;
  sttEnabled: boolean;
}

interface SttModelStatus {
  engine: string;
  model: string;
  downloaded: boolean;
  sizeMb: number;
  path?: string;
}

interface DownloadProgress {
  model: string;
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
  done: boolean;
}

interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category?: string;
}
```

`VoiceConfig` is **persisted** in Zustand — survives app restart.

---

## `useVoice` Hook Pattern (`src/hooks/useVoice.ts`)

```typescript
export function useVoice() {
  const voiceConfig = useAppStore((s) => s.voiceConfig);
  const setVoiceConfig = useAppStore((s) => s.setVoiceConfig);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [modelStatuses, setModelStatuses] = useState<SttModelStatus[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  
  // Fetch model statuses on mount
  useEffect(() => {
    refreshModelStatuses();
  }, []);
  
  // Listen for download progress events
  useEffect(() => {
    const unlisten = tauriListen<DownloadProgress>('stt-download-progress', (event) => {
      setDownloadProgress(event.payload);
      if (event.payload.done) {
        setDownloadProgress(null);
        refreshModelStatuses(); // refresh after download completes
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);
  
  const refreshModelStatuses = async () => {
    const statuses = await tauriInvoke<SttModelStatus[]>('get_stt_model_status');
    setModelStatuses(statuses);
  };
  
  const downloadModel = async (model: string, engine: string) => {
    await tauriInvoke('download_stt_model', { model, engine });
  };
  
  const transcribeAudio = async (audioBytes: number[]): Promise<string> => {
    setIsTranscribing(true);
    try {
      return await tauriInvoke<string>('transcribe_audio', {
        audioBytes,
        engine: voiceConfig.sttEngine,
        model: voiceConfig.sttModel,
      });
    } finally {
      setIsTranscribing(false);
    }
  };
  
  const speakText = async (text: string): Promise<void> => {
    if (!voiceConfig.ttsEnabled || !voiceConfig.elevenlabsApiKey) return;
    const audioBytes = await tauriInvoke<number[]>('tts_elevenlabs', {
      text,
      voiceId: voiceConfig.elevenlabsVoiceId ?? '',
      apiKey: voiceConfig.elevenlabsApiKey,
    });
    // Play audio in browser
    const blob = new Blob([new Uint8Array(audioBytes)], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await audio.play();
    URL.revokeObjectURL(url);
  };
  
  const fetchElevenLabsVoices = async (): Promise<ElevenLabsVoice[]> => {
    if (!voiceConfig.elevenlabsApiKey) return [];
    return tauriInvoke<ElevenLabsVoice[]>('get_elevenlabs_voices', {
      apiKey: voiceConfig.elevenlabsApiKey,
    });
  };
  
  return {
    voiceConfig,
    setVoiceConfig,
    isRecording,
    isTranscribing,
    modelStatuses,
    downloadProgress,
    downloadModel,
    transcribeAudio,
    speakText,
    fetchElevenLabsVoices,
    refreshModelStatuses,
  };
}
```

---

## Recording Audio in the Browser

The frontend records audio using the Web API and converts to bytes for Tauri:

```typescript
// Recording pattern (used inside useVoice or a TutorChat component)
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const audioChunksRef = useRef<Blob[]>([]);

const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  mediaRecorderRef.current = mediaRecorder;
  audioChunksRef.current = [];
  
  mediaRecorder.ondataavailable = (e) => {
    audioChunksRef.current.push(e.data);
  };
  
  mediaRecorder.start();
  setIsRecording(true);
};

const stopRecording = async (): Promise<number[]> => {
  return new Promise((resolve) => {
    const recorder = mediaRecorderRef.current!;
    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      resolve(bytes);
    };
    recorder.stop();
    recorder.stream.getTracks().forEach(track => track.stop());
    setIsRecording(false);
  });
};
```

---

## STT Engines

### sherpa-onnx (Default)
- **Pros**: Fast startup, no C++ build tools needed, pre-built libs
- **Cons**: Slightly lower accuracy than Whisper
- **Cargo gate**: `[target.'cfg(not(target_os = "android"))'.dependencies]`

```rust
// src-tauri/Cargo.toml
[target.'cfg(not(target_os = "android"))'.dependencies]
sherpa-onnx = "1.10"   # prebuilt libs — no cmake needed
```

### whisper-rs (Higher Accuracy)
- **Pros**: Better accuracy, especially for technical terms
- **Cons**: Requires `cmake` + C++ toolchain at build time; slower first-time compilation
- **Cargo gate**: same `cfg(not(target_os = "android"))` block

```rust
whisper-rs = { version = "0.14" }   # requires cmake + C++ toolchain
```

### Available Models
| Model | Size | Accuracy | Speed |
|-------|------|----------|-------|
| `tiny` | ~40MB | Low | Very fast |
| `base` | ~75MB | Medium | Fast |
| `small` | ~245MB | High | Moderate |

Models are downloaded to `{app_data_dir}/stt_models/` on demand.

---

## ElevenLabs TTS Integration

```rust
// In tts_elevenlabs command:
let url = format!(
    "https://api.elevenlabs.io/v1/text-to-speech/{}",
    voice_id
);

let response = reqwest::Client::new()
    .post(&url)
    .header("xi-api-key", &api_key)
    .header("Content-Type", "application/json")
    .json(&serde_json::json!({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }))
    .timeout(Duration::from_secs(30))
    .send()
    .await
    .map_err(|e| format!("TTS request failed: {}", e))?;

if !response.status().is_success() {
    return Err(format!("ElevenLabs API error: {}", response.status()));
}

let bytes = response.bytes().await.map_err(|e| e.to_string())?;
Ok(bytes.to_vec())
```

---

## Settings View Integration

The `SettingsView` should expose:

1. **STT section**: engine selector (sherpa-onnx / whisper-cpp), model selector (tiny/base/small), download button with progress bar, model status indicator
2. **TTS section**: ElevenLabs API key input, voice selector (fetched from `get_elevenlabs_voices`), enable/disable toggle

```typescript
// Settings view pattern for voice config
const { voiceConfig, setVoiceConfig, modelStatuses, downloadProgress, downloadModel, fetchElevenLabsVoices } = useVoice();

// Update config field
const handleEngineChange = (engine: VoiceConfig['sttEngine']) => {
  setVoiceConfig({ ...voiceConfig, sttEngine: engine });
};

// Check if current model is downloaded
const currentModelStatus = modelStatuses.find(
  s => s.engine === voiceConfig.sttEngine && s.model === voiceConfig.sttModel
);
const isModelDownloaded = currentModelStatus?.downloaded ?? false;
```

---

## Debugging Voice Issues

**Symptom: `transcribe_audio` returns error immediately**
→ STT model not downloaded. Check `get_stt_model_status` — `downloaded` must be `true` for the selected engine/model. Show download button in Settings.

**Symptom: Model download never completes**
→ Check network connectivity. The `stt-download-progress` events should fire — if they don't, the Tauri listener may not be registered. Verify `tauriListen` cleanup in `useEffect`.

**Symptom: TTS plays but audio is garbled**
→ Audio bytes may be wrongly converted. `Uint8Array` → `Blob` → `Audio` chain must preserve bytes. Check that `tts_elevenlabs` returns `Vec<u8>` not base64.

**Symptom: Microphone permission denied**
→ `navigator.mediaDevices.getUserMedia` throws. Tauri desktop apps need microphone permission — check `tauri.conf.json` capabilities.

**Symptom: STT not available (mobile/web build)**
→ Correct — STT is `#[cfg(not(target_os = "android"))]` only. Show appropriate UI ("Voice input requires the desktop app").

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttModelStatus {
    pub downloaded: bool,
    pub size_mb: Option<f64>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElevenLabsVoice {
    pub voice_id: String,
    pub name: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub engine: String,
    pub model: String,
    pub percent: u32,
    pub downloaded_mb: f64,
    pub total_mb: f64,
}

// ── Desktop-only helpers (model paths, downloads, transcription) ──────────────

#[cfg(not(target_os = "android"))]
mod desktop {
    use super::*;
    use std::path::PathBuf;
    use tauri::{Emitter, Manager};

    pub fn models_dir(app: &AppHandle) -> PathBuf {
        let dir = app
            .path()
            .app_data_dir()
            .expect("no app data dir")
            .join("voice_models");
        std::fs::create_dir_all(&dir).ok();
        dir
    }

    pub fn whisper_cpp_model_path(app: &AppHandle, model: &str) -> PathBuf {
        models_dir(app).join(format!("whisper-cpp-{}.bin", model))
    }

    pub fn sherpa_model_dir(app: &AppHandle, model: &str) -> PathBuf {
        models_dir(app).join(format!("sherpa-onnx-whisper-{}", model))
    }

    fn whisper_cpp_url(model: &str) -> String {
        let name = match model {
            "tiny"  => "ggml-tiny.en.bin",
            "base"  => "ggml-base.en.bin",
            "small" => "ggml-small.en.bin",
            _       => "ggml-base.en.bin",
        };
        format!(
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
            name
        )
    }

    fn sherpa_onnx_urls(model: &str) -> (&'static str, &'static str, &'static str) {
        match model {
            "tiny" => (
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/resolve/main/tiny.en-encoder.int8.onnx",
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/resolve/main/tiny.en-decoder.int8.onnx",
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/resolve/main/tokens.txt",
            ),
            "base" => (
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base.en/resolve/main/base.en-encoder.int8.onnx",
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base.en/resolve/main/base.en-decoder.int8.onnx",
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base.en/resolve/main/tokens.txt",
            ),
            _ => (
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small.en/resolve/main/small.en-encoder.int8.onnx",
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small.en/resolve/main/small.en-decoder.int8.onnx",
                "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small.en/resolve/main/tokens.txt",
            ),
        }
    }

    pub fn model_size_hint_mb(engine: &str, model: &str) -> f64 {
        match (engine, model) {
            ("whisper-cpp", "tiny")  => 75.0,
            ("whisper-cpp", "base")  => 142.0,
            ("whisper-cpp", "small") => 466.0,
            ("sherpa-onnx", "tiny")  => 42.0,
            ("sherpa-onnx", "base")  => 80.0,
            ("sherpa-onnx", "small") => 195.0,
            _ => 150.0,
        }
    }

    pub async fn download_file(
        app: &AppHandle,
        url: &str,
        dest: &PathBuf,
        engine: &str,
        model: &str,
        base_downloaded: u64,
        total_bytes: u64,
    ) -> Result<(), String> {
        let client = Client::new();
        let response = client
            .get(url)
            .header("User-Agent", "personal-tutor/1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("HTTP {} downloading {}", response.status(), url));
        }

        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut file = tokio::fs::File::create(dest).await.map_err(|e| e.to_string())?;
        let mut downloaded = base_downloaded;
        let mut stream = response;

        while let Some(chunk) = stream.chunk().await.map_err(|e| e.to_string())? {
            tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
                .await
                .map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;

            if total_bytes > 0 {
                let percent = ((downloaded as f64 / total_bytes as f64) * 100.0) as u32;
                let _ = app.emit(
                    "stt-download-progress",
                    DownloadProgress {
                        engine: engine.to_string(),
                        model: model.to_string(),
                        percent,
                        downloaded_mb: downloaded as f64 / 1_048_576.0,
                        total_mb: total_bytes as f64 / 1_048_576.0,
                    },
                );
            }
        }

        Ok(())
    }

    pub async fn do_download_whisper_cpp(app: &AppHandle, model: &str) -> Result<(), String> {
        let dest = whisper_cpp_model_path(app, model);
        if dest.exists() {
            return Ok(());
        }
        let url = whisper_cpp_url(model);
        let total = (model_size_hint_mb("whisper-cpp", model) * 1_048_576.0) as u64;
        download_file(app, &url, &dest, "whisper-cpp", model, 0, total).await
    }

    pub async fn do_download_sherpa_onnx(app: &AppHandle, model: &str) -> Result<(), String> {
        let dir = sherpa_model_dir(app, model);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        let (enc_url, dec_url, tok_url) = sherpa_onnx_urls(model);
        let total = (model_size_hint_mb("sherpa-onnx", model) * 1_048_576.0) as u64;

        let enc_dest = dir.join(format!("{}.en-encoder.int8.onnx", model));
        let dec_dest = dir.join(format!("{}.en-decoder.int8.onnx", model));
        let tok_dest = dir.join("tokens.txt");

        if !enc_dest.exists() {
            download_file(app, enc_url, &enc_dest, "sherpa-onnx", model, 0, total).await?;
        }
        if !dec_dest.exists() {
            download_file(app, dec_url, &dec_dest, "sherpa-onnx", model, total / 2, total).await?;
        }
        if !tok_dest.exists() {
            download_file(app, tok_url, &tok_dest, "sherpa-onnx", model, total, total).await?;
        }

        Ok(())
    }

    // ── Transcription engines ────────────────────────────────────────────────

    pub fn transcribe_whisper_cpp(app: &AppHandle, samples: &[f32], model: &str) -> Result<String, String> {
        use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

        let model_path = whisper_cpp_model_path(app, model);
        if !model_path.exists() {
            return Err(format!(
                "Model not downloaded. Go to Settings → Voice and download the {} model.",
                model
            ));
        }

        let ctx = WhisperContext::new_with_params(
            model_path.to_str().unwrap(),
            WhisperContextParameters::default(),
        )
        .map_err(|e| e.to_string())?;

        let mut state = ctx.create_state().map_err(|e| e.to_string())?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state.full(params, samples).map_err(|e| e.to_string())?;

        let n = state.full_n_segments().map_err(|e| e.to_string())?;
        let text: String = (0..n)
            .filter_map(|i| state.full_get_segment_text(i).ok())
            .collect::<Vec<_>>()
            .join("");

        Ok(text.trim().to_string())
    }

    pub fn transcribe_sherpa_onnx(app: &AppHandle, samples: &[f32], model: &str) -> Result<String, String> {
        use sherpa_onnx::{
            OfflineRecognizer, OfflineRecognizerConfig, OfflineWhisperModelConfig,
        };

        let dir = sherpa_model_dir(app, model);
        let encoder = dir.join(format!("{}.en-encoder.int8.onnx", model));
        let decoder = dir.join(format!("{}.en-decoder.int8.onnx", model));
        let tokens  = dir.join("tokens.txt");

        if !encoder.exists() || !decoder.exists() || !tokens.exists() {
            return Err(format!(
                "Sherpa-ONNX {} model not downloaded. Go to Settings → Voice.",
                model
            ));
        }

        // Build config using the 1.13.x field-mutation style (FeatureConfig removed)
        let mut config = OfflineRecognizerConfig::default();
        config.model_config.whisper = OfflineWhisperModelConfig {
            encoder: Some(encoder.to_str().unwrap().to_string()),
            decoder: Some(decoder.to_str().unwrap().to_string()),
            language: Some("en".to_string()),
            task: Some("transcribe".to_string()),
            tail_paddings: -1,
            enable_token_timestamps: false,
            enable_segment_timestamps: false,
        };
        config.model_config.tokens = Some(tokens.to_str().unwrap().to_string());
        config.model_config.num_threads = 2;
        config.model_config.provider = Some("cpu".to_string());

        let recognizer = OfflineRecognizer::create(&config)
            .ok_or_else(|| "Failed to create Sherpa-ONNX recognizer. Check that model files are valid.".to_string())?;

        let stream = recognizer.create_stream();
        stream.accept_waveform(16000, samples);
        recognizer.decode(&stream);

        let result = stream.get_result()
            .ok_or_else(|| "Sherpa-ONNX returned no result".to_string())?;

        Ok(result.text.trim().to_string())
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_stt_model_status(
    #[allow(unused_variables)]
    app: AppHandle,
    #[allow(unused_variables)]
    engine: String,
    #[allow(unused_variables)]
    model: String,
) -> Result<SttModelStatus, String> {
    #[cfg(target_os = "android")]
    {
        return Ok(SttModelStatus { downloaded: false, size_mb: None, path: None });
    }

    #[cfg(not(target_os = "android"))]
    {
        let exists = match engine.as_str() {
            "whisper-cpp" => {
                let p = desktop::whisper_cpp_model_path(&app, &model);
                if p.exists() {
                    let size_mb = p.metadata().ok().map(|m| m.len() as f64 / 1_048_576.0);
                    return Ok(SttModelStatus {
                        downloaded: true,
                        size_mb,
                        path: Some(p.to_string_lossy().to_string()),
                    });
                }
                false
            }
            "sherpa-onnx" => {
                let dir = desktop::sherpa_model_dir(&app, &model);
                let enc = dir.join(format!("{}.en-encoder.int8.onnx", model));
                let dec = dir.join(format!("{}.en-decoder.int8.onnx", model));
                let tok = dir.join("tokens.txt");
                enc.exists() && dec.exists() && tok.exists()
            }
            _ => false,
        };

        Ok(SttModelStatus { downloaded: exists, size_mb: None, path: None })
    }
}

#[tauri::command]
pub async fn download_stt_model(
    #[allow(unused_variables)]
    app: AppHandle,
    #[allow(unused_variables)]
    engine: String,
    #[allow(unused_variables)]
    model: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return Err("On-device STT model downloads are not supported on Android.".to_string());
    }

    #[cfg(not(target_os = "android"))]
    {
        match engine.as_str() {
            "whisper-cpp" => desktop::do_download_whisper_cpp(&app, &model).await,
            "sherpa-onnx" => desktop::do_download_sherpa_onnx(&app, &model).await,
            _ => Err(format!("Unknown engine: {}", engine)),
        }
    }
}

#[tauri::command]
pub async fn transcribe_audio(
    #[allow(unused_variables)]
    app: AppHandle,
    #[allow(unused_variables)]
    samples: Vec<f32>,
    #[allow(unused_variables)]
    engine: String,
    #[allow(unused_variables)]
    model: String,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        return Err("On-device transcription is not available on Android.".to_string());
    }

    #[cfg(not(target_os = "android"))]
    {
        tokio::task::spawn_blocking(move || {
            match engine.as_str() {
                "whisper-cpp" => desktop::transcribe_whisper_cpp(&app, &samples, &model),
                "sherpa-onnx" => desktop::transcribe_sherpa_onnx(&app, &samples, &model),
                _ => Err(format!("Unknown STT engine: {}", engine)),
            }
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

// ── ElevenLabs TTS (all platforms) ───────────────────────────────────────────

#[tauri::command]
pub async fn tts_elevenlabs(
    text: String,
    api_key: String,
    voice_id: String,
) -> Result<String, String> {
    if api_key.is_empty() {
        return Err("ElevenLabs API key not set. Add it in Settings → Voice.".to_string());
    }

    let client = Client::new();
    let url = format!(
        "https://api.elevenlabs.io/v1/text-to-speech/{}/stream",
        voice_id
    );

    let body = serde_json::json!({
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8,
            "speed": 1.0
        }
    });

    let response = client
        .post(&url)
        .header("xi-api-key", &api_key)
        .header("Content-Type", "application/json")
        .header("Accept", "audio/mpeg")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let msg = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("ElevenLabs error {}: {}", status, msg));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn get_elevenlabs_voices(api_key: String) -> Result<Vec<ElevenLabsVoice>, String> {
    if api_key.is_empty() {
        return Ok(vec![]);
    }

    let client = Client::new();
    let response = client
        .get("https://api.elevenlabs.io/v1/voices")
        .header("xi-api-key", &api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("ElevenLabs API error: {}", response.status()));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let voices = json["voices"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|v| ElevenLabsVoice {
            voice_id: v["voice_id"].as_str().unwrap_or("").to_string(),
            name: v["name"].as_str().unwrap_or("").to_string(),
            category: v["category"].as_str().unwrap_or("premade").to_string(),
        })
        .collect();

    Ok(voices)
}

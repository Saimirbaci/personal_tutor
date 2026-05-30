pub mod ai;
pub mod commands;
pub mod db;

use commands::{ai as ai_cmd, conversations as conv_cmd, digest as digest_cmd, progress, review, schedule, summaries as summary_cmd, sync_server as sync_cmd, voice as voice_cmd};
use sync_cmd::SyncServerHandle;
use tauri::Manager;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            db::init(app.handle())?;
            app.manage(SyncServerHandle(Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai_cmd::stream_chat,
            ai_cmd::get_providers,
            ai_cmd::get_ollama_models,
            ai_cmd::get_openrouter_models,
            ai_cmd::save_provider_config,
            conv_cmd::new_conversation,
            conv_cmd::save_message,
            conv_cmd::list_conversations,
            conv_cmd::get_conversation_messages,
            conv_cmd::delete_conversation,
            conv_cmd::rename_conversation,
            conv_cmd::bulk_import_sync,
            progress::log_session,
            progress::get_progress,
            progress::get_streak,
            progress::update_milestone,
            review::record_review_attempt,
            review::get_due_reviews,
            review::get_review_counts,
            summary_cmd::save_conversation_summary,
            summary_cmd::get_conversation_summary,
            summary_cmd::list_recent_summaries,
            summary_cmd::seed_review_items_from_summary,
            ai_cmd::summarize_conversation,
            schedule::get_today_schedule,
            schedule::schedule_notification,
            digest_cmd::generate_weekly_digest,
            digest_cmd::get_weekly_digests,
            digest_cmd::maybe_generate_due_digest,
            digest_cmd::export_weekly_digest,
            sync_cmd::start_sync_server,
            sync_cmd::stop_sync_server,
            sync_cmd::get_sync_server_status,
            voice_cmd::get_stt_model_status,
            voice_cmd::download_stt_model,
            voice_cmd::transcribe_audio,
            voice_cmd::tts_elevenlabs,
            voice_cmd::get_elevenlabs_voices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

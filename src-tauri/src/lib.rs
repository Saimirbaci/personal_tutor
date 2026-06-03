pub mod ai;
pub mod commands;
pub mod db;

use commands::{
    activation, ai as ai_cmd, analytics, conversations as conv_cmd, depth, digest as digest_cmd,
    gaps, mastery, progress, rebalance, review, schedule, summaries as summary_cmd,
    sync_server as sync_cmd, voice as voice_cmd,
};
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
            ai_cmd::collect_completion,
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
            review::get_forgetting_curve_due,
            review::mark_review_notified,
            summary_cmd::save_conversation_summary,
            summary_cmd::get_conversation_summary,
            summary_cmd::list_recent_summaries,
            summary_cmd::seed_review_items_from_summary,
            ai_cmd::summarize_conversation,
            mastery::recompute_mastery,
            mastery::get_mastery_scores,
            // Learning analytics commands
            analytics::get_learning_velocity,
            analytics::get_effort_mastery_matrix,
            activation::get_activation_quiz,
            // Knowledge gap commands
            gaps::get_knowledge_gaps,
            gaps::detect_knowledge_gaps,
            gaps::dismiss_gap,
            gaps::mark_gap_drilled,
            // Session depth scoring commands
            depth::save_conversation_depth,
            depth::get_conversation_depth,
            depth::list_conversation_depths,
            schedule::get_today_schedule,
            schedule::schedule_notification,
            schedule::get_morning_briefing,
            digest_cmd::generate_weekly_digest,
            digest_cmd::get_weekly_digests,
            digest_cmd::maybe_generate_due_digest,
            digest_cmd::export_weekly_digest,
            rebalance::get_pillar_drift,
            rebalance::generate_plan_rebalance,
            rebalance::get_plan_adjustments,
            rebalance::apply_plan_adjustment,
            rebalance::dismiss_plan_adjustment,
            rebalance::maybe_generate_due_rebalance,
            rebalance::get_rebalance_settings,
            rebalance::set_rebalance_settings,
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

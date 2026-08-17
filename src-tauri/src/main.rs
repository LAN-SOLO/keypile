// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod pwned;
mod settings;
mod state;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_settings,
            commands::create_vault,
            commands::open_vault,
            commands::lock_vault,
            commands::vault_status,
            commands::list_entries,
            commands::get_entry,
            commands::save_entry,
            commands::delete_entry,
            commands::restore_entry,
            commands::purge_entry,
            commands::empty_trash,
            commands::list_folders,
            commands::save_folder,
            commands::delete_folder,
            commands::generate_password,
            commands::generate_passphrase,
            commands::password_strength,
            commands::totp_code,
            commands::copy_secret,
            commands::copy_entry_field,
            commands::health_report,
            commands::check_pwned,
            commands::import_file,
            commands::export_csv_file,
            commands::change_master_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running keypile");
}

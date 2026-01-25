use std::fs;
use std::path::Path;

fn main() {
    // Conditional STT capabilities generation
    // When building with --features stt, generate the stt.json capability file
    // When building without stt feature, remove it to avoid permission errors

    let capabilities_dir = Path::new("capabilities");
    let stt_capabilities_path = capabilities_dir.join("stt.json");

    #[cfg(feature = "stt")]
    {
        // Generate STT capabilities file when stt feature is enabled
        let stt_capabilities = r#"{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "stt",
  "description": "Speech-to-Text capabilities (requires Vosk library)",
  "windows": [
    "main"
  ],
  "permissions": [
    "stt:allow-is-available",
    "stt:allow-start",
    "stt:allow-stop"
  ]
}
"#;

        fs::write(&stt_capabilities_path, stt_capabilities)
            .expect("Failed to write STT capabilities file");

        println!("cargo:warning=STT feature enabled - generated stt.json capabilities");
    }

    #[cfg(not(feature = "stt"))]
    {
        // Remove STT capabilities file when stt feature is not enabled
        // This prevents "permission not found" errors during build
        if stt_capabilities_path.exists() {
            fs::remove_file(&stt_capabilities_path)
                .expect("Failed to remove STT capabilities file");
            println!("cargo:warning=STT feature disabled - removed stt.json capabilities");
        }
    }

    // Rebuild if stt feature changes
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_STT");

    tauri_build::build()
}

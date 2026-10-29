use std::env;
use std::fs;
use std::path::PathBuf;

/// Packs the built launcher into the installer so the setup is a single file.
/// `CHUNK_PAYLOAD` overrides the launcher binary to embed; without one the installer still
/// builds (for `cargo check`) but refuses to install.
fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let payload = env::var("CHUNK_PAYLOAD")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest.join("../../target/release/Chunk.exe"));
    println!("cargo:rerun-if-env-changed=CHUNK_PAYLOAD");
    println!("cargo:rerun-if-changed={}", payload.display());

    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("payload.zst");
    let size = match fs::read(&payload) {
        Ok(bytes) => {
            let packed = zstd::encode_all(bytes.as_slice(), 19)
                .expect("failed to compress the launcher payload");
            fs::write(&out, packed).unwrap();
            bytes.len()
        }
        Err(_) => {
            println!(
                "cargo:warning=launcher binary not found at {}; the installer will not be able to install",
                payload.display()
            );
            fs::write(&out, []).unwrap();
            0
        }
    };
    println!("cargo:rustc-env=CHUNK_PAYLOAD_SIZE={size}");

    let package = manifest.join("../chunk/package.json");
    println!("cargo:rerun-if-changed={}", package.display());
    let version = fs::read_to_string(&package)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|json| json["version"].as_str().map(str::to_owned))
        .unwrap_or_else(|| "0.0.0".to_owned());
    println!("cargo:rustc-env=CHUNK_VERSION={version}");

    tauri_build::build();
}

use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Read verification key JSON at compile time from env var or default path
    let vk_path = env::var("VERIFIER_VK_JSON")
        .unwrap_or_else(|_| "../../circuits/verification_key.json".to_string());

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("vk_data.rs");

    if Path::new(&vk_path).exists() {
        let vk_json = fs::read_to_string(&vk_path).expect("Failed to read verification key JSON");
        fs::write(
            &dest_path,
            format!(
                "pub const VK_JSON: &str = r#\"{}\"#;\npub const VK_EMBEDDED: bool = true;\n",
                vk_json
            ),
        )
        .unwrap();
        println!("cargo:rerun-if-changed={}", vk_path);
    } else {
        // Provide a placeholder so compilation succeeds before ceremony
        fs::write(
            &dest_path,
            "pub const VK_JSON: &str = \"{}\";\npub const VK_EMBEDDED: bool = false;\n",
        )
        .unwrap();
    }

    println!("cargo:rerun-if-env-changed=VERIFIER_VK_JSON");
}

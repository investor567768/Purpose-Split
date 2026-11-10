#!/usr/bin/env bash
# Builds both contracts and shrinks them with wasm-opt. Output: build/*.wasm
set -euo pipefail
cd "$(dirname "$0")/.."
# `--cfg near` makes near-sdk use NEAR's real host functions (what `cargo near build`
# sets). Without it, panics lose their messages on-chain.
RUSTFLAGS="--cfg near -C link-arg=-s" cargo build --release --target wasm32-unknown-unknown
mkdir -p build
for name in purpose_split test_dollar; do
  # Newer Rust emits bulk-memory and sign-extension instructions. Lower them to
  # plain WebAssembly so the file runs on every NEAR node, then shrink it.
  node scripts/node_modules/binaryen/bin/wasm-opt \
    --enable-bulk-memory --enable-bulk-memory-opt --enable-sign-ext --enable-mutable-globals \
    --llvm-memory-copy-fill-lowering --signext-lowering -Oz --strip-debug \
    "target/wasm32-unknown-unknown/release/${name}.wasm" -o "build/${name}.wasm"
  echo "build/${name}.wasm: $(wc -c < "build/${name}.wasm") bytes, sha256 $(sha256sum "build/${name}.wasm" | cut -c1-16)…"
done

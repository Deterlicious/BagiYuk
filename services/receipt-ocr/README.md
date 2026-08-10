# BagiYuk private receipt OCR

This container runs the pretrained PP-OCRv6 small detection and recognition models on CPU. It returns text, confidence, and polygons only. Receipt images are decoded in memory, never written to disk, and never included in logs.

PaddlePaddle is pinned to 3.2.2 because the 3.3.1 CPU runtime fails PP-OCRv6 inference with an upstream oneDNN new-IR `NotImplementedError` even though model initialization succeeds.

The service is intentionally private. Cloud Run IAM must reject unauthenticated requests; the BagiYuk Worker is the sole invoker and applies Turnstile plus D1 quotas before dispatch.

The runtime uses one CPU thread, a 75-second inference watchdog, root-owned model files, a non-root user, and an ephemeral PaddleX cache. The image build runs a real PP-OCRv6 inference smoke test, so a model/runtime incompatibility fails the build before deployment.

See `docs/deployment.md` for provisioning and deployment commands.

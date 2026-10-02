"""Agent 1: Vision Preprocessor & Image Enhancement Agent.

Specialized in preparing messy, shadowed, or rotated smartphone photos of
handwritten medical prescriptions for multimodal vision LLMs.
Uses PIL to:
1. Auto-correct EXIF orientation (fixes sideways/upside-down phone photos).
2. Auto-contrast & ink-sharpening (makes faded doctor pen strokes distinct from paper).
3. Dimension optimization (bounds max dimension to 2048px to prevent token/memory exhaustion).
4. Returns clean, enhanced image bytes in JPEG format.
"""
from __future__ import annotations

import io
import logging
from typing import Tuple

from PIL import Image, ImageEnhance, ImageOps

logger = logging.getLogger("aarogya.preprocessor")

MAX_DIMENSION = 2048
MIN_DIMENSION = 256


def preprocess_prescription_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> Tuple[bytes, str]:
    """Enhance and normalize prescription image bytes.

    Returns:
        (enhanced_image_bytes, output_mime_type)
    """
    if not image_bytes or len(image_bytes) < 32:
        raise ValueError("Image data is empty or too short to be a valid image.")

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            # 1. Auto-orient based on smartphone EXIF orientation tag
            img = ImageOps.exif_transpose(img) or img

            # Convert palette/RGBA modes to RGB for clean JPEG enhancement
            if img.mode != "RGB":
                img = img.convert("RGB")

            orig_w, orig_h = img.size

            # 2. Downscale smoothly if oversized, keeping aspect ratio
            if max(orig_w, orig_h) > MAX_DIMENSION:
                scale = MAX_DIMENSION / max(orig_w, orig_h)
                new_w = max(MIN_DIMENSION, int(orig_w * scale))
                new_h = max(MIN_DIMENSION, int(orig_h * scale))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                logger.debug(f"Resized image from {orig_w}x{orig_h} to {new_w}x{new_h}")

            # 3. Dynamic contrast stretch (removes shadow haze, clears background paper tint)
            img = ImageOps.autocontrast(img, cutoff=2)

            # 4. Moderate contrast boost (makes blue/black ink stand out from paper)
            contrast_enhancer = ImageEnhance.Contrast(img)
            img = contrast_enhancer.enhance(1.3)

            # 5. Sharpness enhancement (defines squiggly cursive edges and handwriting loops)
            sharpness_enhancer = ImageEnhance.Sharpness(img)
            img = sharpness_enhancer.enhance(1.5)

            # Save optimized output
            out_buf = io.BytesIO()
            img.save(out_buf, format="JPEG", quality=90, optimize=True)
            enhanced_bytes = out_buf.getvalue()

            logger.info(
                f"Agent 1 (Preprocessor): Successfully enhanced image ({orig_w}x{orig_h} -> {img.size[0]}x{img.size[1]}, {len(enhanced_bytes)} bytes)"
            )
            return enhanced_bytes, "image/jpeg"

    except Exception as exc:
        logger.warning(
            f"Agent 1 (Preprocessor) encountered non-fatal error: {exc}. Proceeding with original bytes."
        )
        return image_bytes, mime_type

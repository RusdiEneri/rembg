# pyrefly: ignore [missing-import]
import gradio as gr
# pyrefly: ignore [missing-import]
import spaces
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
from PIL import Image
from rembg import remove, new_session
import base64
import io

# ── Cache model ───────────────────────────────────────────────────────────────
_SESSIONS = {}

def get_session(model_name: str):
    if model_name not in _SESSIONS:
        print(f"[INFO] Sedang download/load model: {model_name} ...")
        _SESSIONS[model_name] = new_session(model_name)
    return _SESSIONS[model_name]

def process_image(img: Image.Image, model_name: str, alpha_matting: bool) -> Image.Image:
    img = img.convert("RGB")
    session = get_session(model_name)
    kwargs = {}
    if alpha_matting:
        kwargs.update(
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )
    return remove(img, session=session, **kwargs)

# ── Handler untuk HuggingFace Web UI ──────────────────────────────────────────
@spaces.GPU(duration=60)
def remove_bg_ui(img, model_name, alpha_matting):
    if img is None:
        return None
    if not isinstance(img, Image.Image):
        img = Image.fromarray(np.uint8(img))
    return process_image(img, model_name, alpha_matting)

# ── Handler untuk API Eksternal (Vercel / Next.js) ────────────────────────────
@spaces.GPU(duration=60)
def remove_bg_api(img_data, model_name, alpha_matting):
    """
    Endpoint API untuk Vercel / frontend.
    Menerima base64 data URL atau objek {path: ...}.
    Mengembalikan data:image/png;base64,... secara langsung tanpa perlu file upload terpisah.
    """
    if not img_data:
        return None

    try:
        if isinstance(img_data, str):
            # Jika berupa data URL atau base64 murni
            if "," in img_data:
                img_data = img_data.split(",", 1)[1]
            img_bytes = base64.b64decode(img_data)
            pil_img = Image.open(io.BytesIO(img_bytes))
        elif isinstance(img_data, dict) and "path" in img_data:
            pil_img = Image.open(img_data["path"])
        else:
            return None

        result_img = process_image(pil_img, model_name, alpha_matting)

        # Encode hasil ke base64 PNG
        buffered = io.BytesIO()
        result_img.save(buffered, format="PNG")
        b64_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{b64_str}"
    except Exception as e:
        print(f"[ERROR] API processing failed: {e}")
        raise e

# ── Gradio Blocks Interface ───────────────────────────────────────────────────
with gr.Blocks(title="Background Remover AI") as demo:
    gr.Markdown("# 🚀 AI Background Remover")
    gr.Markdown("Hapus background gambar dengan presisi tinggi menggunakan ZeroGPU.")

    # Tampilan UI untuk pengunjung HuggingFace Space
    with gr.Row():
        with gr.Column():
            ui_input = gr.Image(type="pil", label="Upload Gambar")
            ui_model = gr.Dropdown(
                choices=[
                    "birefnet-portrait",
                    "birefnet-general",
                    "isnet-general-use",
                    "u2net_human_seg",
                ],
                value="birefnet-portrait",
                label="Model AI",
            )
            ui_alpha = gr.Checkbox(value=False, label="Alpha Matting (haluskan edge rambut)")
            ui_btn = gr.Button("Hapus Background", variant="primary")
        with gr.Column():
            ui_output = gr.Image(type="pil", label="Hasil (PNG Transparan)")

    ui_btn.click(
        fn=remove_bg_ui,
        inputs=[ui_input, ui_model, ui_alpha],
        outputs=ui_output,
    )

    # Komponen API untuk Vercel / endpoint /gradio_api/call/remove_bg
    with gr.Row(visible=False):
        api_input = gr.Textbox(label="Image Base64")
        api_model = gr.Textbox(value="birefnet-portrait", label="Model")
        api_alpha = gr.Checkbox(value=False, label="Alpha Matting")
        api_output = gr.Textbox(label="Result Base64")
        api_btn = gr.Button("API Trigger")

    api_btn.click(
        fn=remove_bg_api,
        inputs=[api_input, api_model, api_alpha],
        outputs=api_output,
        api_name="remove_bg",
    )

if __name__ == "__main__":
    demo.launch()
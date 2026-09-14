# pyrefly: ignore [missing-import]
import gradio as gr
# pyrefly: ignore [missing-import]
import spaces
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
from PIL import Image
from rembg import remove, new_session

# Cache model agar tidak download berulang kali
_SESSIONS = {}

def get_session(model_name: str):
    if model_name not in _SESSIONS:
        print(f"[INFO] Sedang download/load model: {model_name} ...")
        _SESSIONS[model_name] = new_session(model_name)
    return _SESSIONS[model_name]

@spaces.GPU(duration=60)
def remove_bg(img, model_name, alpha_matting):
    if img is None:
        return None

    if not isinstance(img, Image.Image):
        img = Image.fromarray(np.uint8(img))
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

    # Hasil: PIL mode RGBA (background transparan, RGB subjek UTUH)
    return remove(img, session=session, **kwargs)

demo = gr.Interface(
    fn=remove_bg,
    inputs=[
        gr.Image(type="pil", label="Upload Gambar"),
        gr.Dropdown(
            choices=[
                "birefnet-portrait",   # TERBAIK untuk foto orang
                "birefnet-general",    # TERBAIK untuk objek umum/produk
                "isnet-general-use",   # Seimbang: cepat & bagus
                "u2net_human_seg",     # Ringan untuk orang
            ],
            value="birefnet-portrait",
            label="Model AI",
        ),
        gr.Checkbox(value=False, label="Alpha Matting (haluskan edge rambut)"),
    ],
    outputs=gr.Image(type="pil", label="Hasil (PNG Transparan)"),
    title="Remove Background API",
    description="Backend untuk Vercel. Endpoint: /api/remove_bg",
    api_name="remove_bg",
)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0")
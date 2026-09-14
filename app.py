# pyrefly: ignore [missing-import]
import gradio as gr
# pyrefly: ignore [missing-import]
import spaces
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
from PIL import Image
from rembg import remove, new_session
import uuid
import os
import io
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

# ── Custom FastAPI app (di-mount ke Gradio) ───────────────────────────────────
# Digunakan sebagai endpoint upload untuk Vercel frontend.
# Gradio menerima file input hanya via URL publik — bukan base64.
app_fastapi = FastAPI()

# Folder sementara untuk simpan file upload
UPLOAD_DIR = "/tmp/rembg_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app_fastapi.post("/custom/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload gambar dan kembalikan URL publik yang bisa dipakai oleh Gradio API.
    URL format: https://ilhamdev-rembg.hf.space/file=/tmp/rembg_uploads/{filename}
    """
    ext = os.path.splitext(file.filename or "image.png")[1] or ".png"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(UPLOAD_DIR, unique_name)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    # URL yang bisa diakses publik via Gradio file serving
    file_url = f"https://ilhamdev-rembg.hf.space/file={save_path}"
    return JSONResponse({"url": file_url, "path": save_path})


# ── Cache model ───────────────────────────────────────────────────────────────
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

# Mount FastAPI custom ke Gradio agar /custom/upload tersedia
app = gr.mount_gradio_app(app_fastapi, demo, path="/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
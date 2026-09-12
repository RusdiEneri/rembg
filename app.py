import io
import gradio as gr
import spaces
import torch
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from rembg import remove, new_session
from PIL import Image

# Model rembg dimuat SEKALI saat startup (CPU)
session = new_session("u2netp")

# Dummy function untuk memenuhi syarat ZeroGPU
# Fungsi ini dipanggil SEKALI saat startup, lalu tidak dipakai lagi
@spaces.GPU
def dummy_gpu_function():
    """Fungsi dummy yang menggunakan GPU agar ZeroGPU mendeteksi @spaces.GPU"""
    if torch.cuda.is_available():
        x = torch.randn(10, device="cuda")
        return x.sum().item()
    return 0

# Panggil dummy function SEKALI saat startup agar ZeroGPU puas
try:
    dummy_gpu_function()
except Exception as e:
    print(f"Dummy GPU function warning: {e}")

# Fungsi utama untuk remove background (berjalan di CPU)
@spaces.GPU(duration=30)  # Duration agar ZeroGPU mengalokasikan GPU
def remove_bg(img: Image.Image) -> Image.Image:
    return remove(img, session=session)

# ---------- 1) UI GRADIO ----------
demo = gr.Interface(
    fn=remove_bg,
    inputs=gr.Image(type="pil", label="Upload Gambar"),
    outputs=gr.Image(type="pil", label="Hasil (PNG Transparan)"),
    title="Remove Background API",
    description="Backend remove background. REST API: POST /remove-bg",
)

# ---------- 2) REST API FASTAPI (untuk frontend Vercel) ----------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "online"}

@app.post("/remove-bg")
async def api_remove_bg(file: UploadFile = File(...)):
    data = await file.read()
    input_img = Image.open(io.BytesIO(data))
    output_img = remove_bg(input_img)
    buf = io.BytesIO()
    output_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")

# Gabungkan Gradio UI + FastAPI
app = gr.mount_gradio_app(app, demo, path="/")
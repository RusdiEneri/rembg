import io
import gradio as gr
import spaces
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from transparent_background import Remover
from PIL import Image

# Inisialisasi remover SEKALI saat startup (akan otomatis detect GPU)
remover = Remover(mode='base')

@spaces.GPU(duration=30)
def remove_bg(img: Image.Image) -> Image.Image:
    """Remove background menggunakan transparent-background (GPU accelerated)"""
    return remover.process(img, type='rgba')

# ---------- 1) UI GRADIO ----------
demo = gr.Interface(
    fn=remove_bg,
    inputs=gr.Image(type="pil", label="Upload Gambar"),
    outputs=gr.Image(type="pil", label="Hasil (PNG Transparan)"),
    title="Remove Background API",
    description="Backend remove background dengan GPU acceleration. REST API: POST /remove-bg",
    examples=[],
    cache_examples=False,
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
    return {"status": "online", "gpu_available": True}

@app.post("/remove-bg")
async def api_remove_bg(file: UploadFile = File(...)):
    data = await file.read()
    input_img = Image.open(io.BytesIO(data)).convert("RGB")
    output_img = remove_bg(input_img)
    buf = io.BytesIO()
    output_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")

# Gabungkan Gradio UI + FastAPI
app = gr.mount_gradio_app(app, demo, path="/")
import io
import gradio as gr
import spaces  # WAJIB untuk ZeroGPU
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from rembg import remove, new_session
from PIL import Image

# Model dimuat SEKALI saat startup (CPU saja, tidak makan VRAM)
session = new_session("u2netp")

# Dekorator @spaces.GPU WAJIB untuk ZeroGPU (meski rembg jalan di CPU)
@spaces.GPU
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
    allow_origins=["*"],  # ganti ke domain Vercel kamu saat production
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
    output_img = remove_bg(input_img)  # Panggil fungsi yang ada @spaces.GPU
    buf = io.BytesIO()
    output_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")

# Gabungkan Gradio UI + FastAPI
app = gr.mount_gradio_app(app, demo, path="/")

# Jangan pakai uvicorn.run() — HF Spaces jalankan otomatis
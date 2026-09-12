from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
from rembg import remove, new_session
from PIL import Image
import io

# Muat model AI sekali saat server start (bukan per-request)
# "u2netp" = versi kecil & cepat (cocok untuk Space gratis).
# Ganti ke "u2net" jika ingin kualitas maksimal.
session = new_session("u2netp")

app = FastAPI()

# Izinkan frontend Vercel mengakses API ini (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Nanti bisa diganti domain Vercel kamu
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return HTMLResponse("<h1>✅ Remove-BG API is ONLINE</h1><p>POST gambar ke /remove-bg</p>")

@app.post("/remove-bg")
async def remove_bg(file: UploadFile = File(...)):
    img = Image.open(io.BytesIO(await file.read()))
    out = remove(img, session=session)

    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
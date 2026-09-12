import gradio as gr
import spaces
from transparent_background import Remover
from PIL import Image
import numpy as np

# Inisialisasi model saat startup (akan otomatis pakai GPU di ZeroGPU)
remover = Remover(mode='base')

@spaces.GPU(duration=60)  # Alokasi GPU selama 60 detik per request
def remove_bg(img):
    if img is None:
        return None
    
    # transparent-background butuh format RGB
    if isinstance(img, np.ndarray):
        img = Image.fromarray(img)
    
    img_rgb = img.convert("RGB")
    
    # Proses hapus background (kembalikan PNG transparan)
    output = remover.process(img_rgb, type='rgba')
    return output

# Buat Interface Gradio Murni
demo = gr.Interface(
    fn=remove_bg,
    inputs=gr.Image(type="pil", label="Upload Gambar"),
    outputs=gr.Image(type="pil", label="Hasil (PNG Transparan)"),
    title="Remove Background API",
    description="Backend untuk Vercel. Endpoint API: /api/remove_bg",
    api_name="remove_bg"  # PENTING: Ini membuat endpoint API otomatis
)

if __name__ == "__main__":
    # Jangan pakai FastAPI, biarkan Gradio berjalan native
    demo.launch()
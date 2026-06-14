"""HTTP routes that drive on-demand caption generation from the node UI.

Generation is a UI action, not graph execution, so the frontend POSTs here and the
heavy work runs in a thread executor to keep ComfyUI's event loop responsive.
"""

import asyncio
import base64
import io
import traceback

from aiohttp import web
from PIL import Image
from server import PromptServer

from . import llm_gemini, llm_local, llm_ollama, llm_openrouter

routes = PromptServer.instance.routes


def _decode_image(image_b64):
    if not image_b64:
        return None
    if "," in image_b64:                       # strip a data URL prefix if present
        image_b64 = image_b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_b64)
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        return None


@routes.post("/ideogram_autoprompter/gemini/models")
async def gemini_models(request):
    try:
        data = await request.json()
        loop = asyncio.get_event_loop()
        models = await loop.run_in_executor(
            None, llm_gemini.list_models, (data.get("api_key") or "").strip()
        )
        return web.json_response({"models": models})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.post("/ideogram_autoprompter/ollama/models")
async def ollama_models(request):
    try:
        data = await request.json()
        loop = asyncio.get_event_loop()
        models = await loop.run_in_executor(
            None, llm_ollama.list_models, (data.get("host") or "").strip()
        )
        return web.json_response({"models": models})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.post("/ideogram_autoprompter/openrouter/models")
async def openrouter_models(request):
    try:
        data = await request.json()
        loop = asyncio.get_event_loop()
        models = await loop.run_in_executor(
            None, llm_openrouter.list_models, (data.get("api_key") or "").strip()
        )
        return web.json_response({"models": models})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.post("/ideogram_autoprompter/generate")
async def generate(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid request body."}, status=400)

    backend = data.get("backend", "local")
    idea = data.get("idea", "")
    density = "high" if data.get("density") == "high" else "normal"
    think = bool(data.get("think", False))
    pil_image = _decode_image(data.get("image_b64"))
    loop = asyncio.get_event_loop()

    try:
        if backend == "gemini":
            caption = await loop.run_in_executor(
                None, lambda: llm_gemini.generate(
                    (data.get("api_key") or "").strip(),
                    data.get("model") or "",
                    idea, pil_image, density=density,
                ),
            )
        elif backend == "ollama":
            caption = await loop.run_in_executor(
                None, lambda: llm_ollama.generate(
                    (data.get("host") or "").strip(),
                    data.get("model") or "",
                    idea, pil_image, density=density, think=think,
                    unload_after=bool(data.get("unload_after", True)),
                ),
            )
        elif backend == "openrouter":
            caption = await loop.run_in_executor(
                None, lambda: llm_openrouter.generate(
                    (data.get("api_key") or "").strip(),
                    data.get("model") or "",
                    idea, pil_image, density=density,
                ),
            )
        else:
            attn = data.get("attn") or "auto"
            caption = await loop.run_in_executor(
                None, lambda: llm_local.generate(
                    idea,
                    pil_image=pil_image,
                    model_id=(data.get("model") or "").strip() or None,
                    four_bit=bool(data.get("four_bit", False)),
                    unload_after=bool(data.get("unload_after", True)),
                    density=density,
                    attn=attn,
                    think=think,
                ),
            )
        return web.json_response({"caption": caption})
    except Exception as e:
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=400)


@routes.get("/ideogram_autoprompter/local/status")
async def local_status(request):
    return web.json_response(dict(llm_local.STATUS, loaded=llm_local.is_loaded()))


@routes.post("/ideogram_autoprompter/local/unload")
async def local_unload(request):
    llm_local.unload()
    return web.json_response({"ok": True})

"""OpenRouter backend over the OpenAI-compatible chat completions API.

Kept to plain `requests` so no extra SDK is required. The user supplies an
OpenRouter API key in the node UI, fetches the available vision models, then
generates. The key is never written into the workflow.

Unlike Gemini we do not force a JSON response_format: OpenRouter spans many
providers and some reject that field, so — like the local/ollama backends — we
rely on the system prompt plus parse_caption()'s tolerant JSON extraction.
"""

import base64
import io as _io

import requests

from .caption_schema import build_user_prompt, get_system_prompt, parse_caption

API_ROOT = "https://openrouter.ai/api/v1"

# Optional attribution headers OpenRouter surfaces on its dashboard; harmless if ignored.
_BASE_HEADERS = {
    "HTTP-Referer": "https://github.com/collbroGTR/comfyui-ideogram-autoprompter",
    "X-Title": "Ideogram 4 Autoprompter",
}


def _headers(api_key):
    h = dict(_BASE_HEADERS)
    if api_key:
        h["Authorization"] = "Bearer %s" % api_key
    return h


def _err(resp):
    try:
        e = resp.json().get("error", {})
        msg = e.get("message") if isinstance(e, dict) else e
        return "OpenRouter API %s: %s" % (resp.status_code, msg or resp.text[:200])
    except Exception:
        return "OpenRouter API %s: %s" % (resp.status_code, resp.text[:200])


def list_models(api_key):
    """Return [{id, display_name}] for models that accept image input."""
    r = requests.get("%s/models" % API_ROOT, headers=_headers(api_key), timeout=30)
    if r.status_code != 200:
        raise ValueError(_err(r))
    out = []
    for m in r.json().get("data", []):
        arch = m.get("architecture") or {}
        mods = arch.get("input_modalities") or []
        if "image" not in mods and "image" not in (arch.get("modality") or ""):
            continue
        mid = m.get("id", "")
        out.append({"id": mid, "display_name": m.get("name", mid)})
    out.sort(key=lambda x: x["id"])
    return out


def generate(api_key, model_id, idea, pil_image=None, density="normal"):
    """Call chat/completions and return a normalized caption dict."""
    if not api_key:
        raise ValueError("No API key provided.")
    if not model_id:
        raise ValueError("No model selected.")

    content = [{"type": "text", "text": build_user_prompt(idea, pil_image is not None)}]
    if pil_image is not None:
        buf = _io.BytesIO()
        pil_image.convert("RGB").save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        content.append({
            "type": "image_url",
            "image_url": {"url": "data:image/png;base64,%s" % b64},
        })

    body = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": get_system_prompt(density)},
            {"role": "user", "content": content},
        ],
        "temperature": 0.7,
    }
    r = requests.post("%s/chat/completions" % API_ROOT, headers=_headers(api_key), json=body, timeout=120)
    if r.status_code != 200:
        raise ValueError(_err(r))

    data = r.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("OpenRouter returned no choices.")
    text = (choices[0].get("message") or {}).get("content") or ""
    return parse_caption(text)
